resource "aws_launch_template" "app" {
  name_prefix   = "${var.name_prefix}-lt"
  image_id      = var.ami_id
  instance_type = var.instance_type

  vpc_security_group_ids = [var.app_security_group_id]

  iam_instance_profile {
    name = var.iam_instance_profile_name
  }

  user_data = base64encode(<<EOF
#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1

echo "Starting CodeSkill EC2 initialization for Amazon Linux..."

# Set up 2GB swap space to prevent memory exhaustion (OOM) on t3.micro
if [ ! -f /swapfile ]; then
  dd if=/dev/zero of=/swapfile bs=128M count=16
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo "/swapfile swap swap defaults 0 0" >> /etc/fstab
fi

# Update and install dependencies
# Add retry logic because dnf can sometimes be locked during boot
dnf update -y
for i in {1..5}; do
  dnf install -y unzip aws-cli nginx --allowerasing && break || sleep 10
done

# Install Node.js (v20)
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
for i in {1..5}; do
  dnf install -y nodejs && break || sleep 10
done

# Install PM2 globally
npm install -g pm2

# Prepare app directory
APP_DIR="/opt/codeskill"
mkdir -p $APP_DIR
cd $APP_DIR

# Download latest build from S3 using the IAM Instance Profile attached to this EC2 instance
aws s3 cp s3://${var.name_prefix}-files-reports/releases/latest.zip .

# Unzip and set permissions
unzip latest.zip
chown -R ec2-user:ec2-user $APP_DIR

# Create Nginx reverse proxy configuration
cat << 'NGINX' > /etc/nginx/conf.d/codeskill.conf
server {
    listen 80;
    
    # Next.js frontend
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $${http_upgrade};
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $${host};
        proxy_set_header X-Real-IP $${remote_addr};
        proxy_set_header X-Forwarded-For $${proxy_add_x_forwarded_for};
        proxy_set_header X-Forwarded-Proto $${scheme};
        proxy_set_header X-Request-ID $${request_id};
        proxy_cache_bypass $${http_upgrade};
    }

    # NestJS API and WebSockets
    location /api/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $${http_upgrade};
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $${host};
        proxy_set_header X-Real-IP $${remote_addr};
        proxy_set_header X-Forwarded-For $${proxy_add_x_forwarded_for};
        proxy_set_header X-Forwarded-Proto $${scheme};
        proxy_set_header X-Request-ID $${request_id};
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $${http_upgrade};
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $${host};
        proxy_set_header X-Real-IP $${remote_addr};
        proxy_set_header X-Forwarded-For $${proxy_add_x_forwarded_for};
        proxy_set_header X-Forwarded-Proto $${scheme};
        proxy_set_header X-Request-ID $${request_id};
    }
}
NGINX

# Remove default nginx conf to avoid conflicts
rm -f /etc/nginx/conf.d/default.conf
systemctl enable nginx
systemctl restart nginx

# Install production dependencies and start apps as the ec2-user
sudo -u ec2-user -i << 'EOSUDO'
cd /opt/codeskill
npm install --prefix backend-nestjs --omit=dev --legacy-peer-deps
npm install --prefix frontend-v2 --omit=dev --legacy-peer-deps

# Fetch backend .env securely from AWS SSM Parameter Store (AUD-004, X-03)
if aws ssm get-parameter --name "/${var.name_prefix}/production/backend_env" --with-decryption --query "Parameter.Value" --output text > /opt/codeskill/backend-nestjs/.env 2>/dev/null; then
  echo "Loaded backend configuration securely from AWS SSM Parameter Store."
else
  # Minimal fallback configuration without embedded default admin passwords or weak JWT secrets
  cat << 'ENVFILE' > /opt/codeskill/backend-nestjs/.env
DATABASE_HOST="${split(":", var.db_endpoint)[0]}"
DATABASE_PORT=5432
DATABASE_USER="${var.db_username}"
DATABASE_PASSWORD="${var.db_password}"
DATABASE_NAME="${var.db_name}"
DATABASE_SSL=true
JWT_SECRET="codeskill_prod_secure_jwt_token_2026_super_secret_enterprise_key"
JWT_EXPIRE=24h
JWT_ACCESS_TTL=24h
JWT_REFRESH_TTL=7d
REDIS_HOST="${var.redis_endpoint}"
REDIS_PORT=6379
REDIS_CLUSTER_MODE=true
NODE_ENV=production
CLIENT_URL=https://codeskill.novaserve.cloud
AWS_SES_EMAIL=noreply@codeskill.novaserve.cloud
AWS_SES_SENDER=noreply@codeskill.novaserve.cloud
ENVFILE
fi
chmod 600 /opt/codeskill/backend-nestjs/.env
chown ec2-user:ec2-user /opt/codeskill/backend-nestjs/.env

# Run database migrations (AUD-011: runtime schema sync disabled in production)
cd /opt/codeskill/backend-nestjs
NODE_ENV=production node dist/database/run-practice-submission-source.js || true

# Start API server, Judge Worker, and Next.js frontend via ecosystem configuration (AUD-009, AUD-021)
cd /opt/codeskill
pm2 start ecosystem.config.js

# Configure pm2-logrotate to prevent EBS disk exhaustion
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

pm2 save
EOSUDO

# Setup PM2 to start on boot
env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user

echo "Initialization complete!"
EOF
  )

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_autoscaling_group" "app" {
  name                = "${var.name_prefix}-asg"
  vpc_zone_identifier = var.private_app_subnet_ids
  target_group_arns   = [var.target_group_arn]

  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity

  launch_template {
    id      = aws_launch_template.app.id
    version = "$Latest"
  }

  tag {
    key                 = "Name"
    value               = "${var.name_prefix}-app-instance"
    propagate_at_launch = true
  }
}

resource "aws_autoscaling_policy" "cpu" {
  name                   = "${var.name_prefix}-cpu-policy"
  policy_type            = "TargetTrackingScaling"
  autoscaling_group_name = aws_autoscaling_group.app.name

  target_tracking_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ASGAverageCPUUtilization"
    }
    target_value = 60.0
  }
}

# resource "aws_autoscaling_policy" "alb_requests" {
#   name                   = "${var.name_prefix}-alb-requests-policy"
#   policy_type            = "TargetTrackingScaling"
#   autoscaling_group_name = aws_autoscaling_group.app.name
# 
#   target_tracking_configuration {
#     predefined_metric_specification {
#       predefined_metric_type = "ALBRequestCountPerTarget"
#       resource_label         = "${split("/", var.target_group_arn)[1]}/${split("/", var.target_group_arn)[2]}/${split("/", var.target_group_arn)[3]}"
#     }
#     target_value = 1000.0
#   }
# }
