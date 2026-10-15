# CodeSkill Production AWS Infrastructure (Terraform)

Modular, production-grade, cost-optimized AWS infrastructure for the **CodeSkill** online coding examination platform ([https://codeskill.novaserve.cloud/](https://codeskill.novaserve.cloud/)), targeting up to 2,000 registered students with examination traffic spikes in the **`ap-south-1` (Mumbai)** region.

---

## 1. Architectural Overview

```
                                      [ Internet ]
                                           │
                                    (HTTPS Port 443)
                                           │
                        ┌──────────────────▼──────────────────┐
                        │    Application Load Balancer (ALB)   │
                        │    (Multi-AZ Public Subnets 1a & 1b)│
                        │    ACM TLS 1.3 / Port 80 Redirect   │
                        └──────────────────┬──────────────────┘
                                           │
                      ┌────────────────────┴────────────────────┐
                      │                                         │
        (HTTP: 80 / Reverse Proxy)                   (Internal API: 2358)
                      │                                         │
        ┌─────────────▼─────────────┐             ┌─────────────▼─────────────┐
        │   Application ASG Fleet   │             │   Judge0 Execution Host   │
        │      (Next.js + NestJS)   │────────────►│  (Docker Sandboxing Engine│
        │  Instance: t4g.small      │             │  Instance: m7i-flex.large │
        │  Arch: ARM64 (Graviton2)  │             │  Arch: x86_64, 8 GiB RAM  │
        │  Auto Scaling: 1 - 2 nodes│             │  Capacity: 1 dedicated host│
        └─────────────┬─────────────┘             └───────────────────────────┘
                      │
               (PostgreSQL: 5432)
                      │
        ┌─────────────▼─────────────┐
        │    RDS PostgreSQL 15.7    │
        │  Instance: db.t4g.micro   │
        │  Storage: 20 GiB gp3      │
        │  Subnets: Isolated DB     │
        │  Max Connections: 50      │
        │  Secrets Manager Enforced │
        └───────────────────────────┘
```

### Key Architectural Tenets:
1. **Multi-Architecture Separation**:
   - **Application Tier**: Runs on cost-effective AWS Graviton2 (`t4g.small`, ARM64), offering superior performance-per-dollar for Node.js/Next.js/NestJS workloads.
   - **Judge0 Execution Tier**: Runs on modern Intel compute (`m7i-flex.large`, x86_64, 2 vCPU, 8 GiB RAM), providing broad binary runtime package compatibility (GCC, Python, Java, Node.js) and dedicated isolation.
2. **Strict Security Isolation**:
   - Zero open SSH ports (`0.0.0.0/0:22`). Remote administration is conducted strictly via **AWS Systems Manager (SSM) Session Manager**.
   - Database resides in private subnets with **no public IP address** and accepts connections strictly from the Application Security Group on port 5432.
   - Judge0 sandbox containers are blocked from the AWS Instance Metadata Service (`169.254.169.254`) via iptables, preventing untrusted student code from accessing EC2 IAM roles or AWS tokens.
3. **Stateless Scalability**:
   - Sessions are managed via JWT; stateful database transactions persist in RDS.
   - S3 is utilized for exam collateral and submission attachments through a **free S3 Gateway VPC Endpoint**.

---

## 2. Directory Structure

```
terraform/
├── versions.tf                  # Terraform >= 1.5.0, AWS provider ~> 5.0, Random provider
├── providers.tf                 # AWS Provider configuration with default resource tags
├── main.tf                      # Root module orchestrating all child modules
├── variables.tf                 # Fully typed, documented configuration variables
├── outputs.tf                   # Endpoints, DNS names, Secret ARNs, SSM access commands
├── locals.tf                    # Profile logic (Budget vs Exam), tag propagation, subnet routing
├── terraform.tfvars.example     # Ready-to-use variable configuration template
├── backend.tf.example           # S3 + DynamoDB remote state backend configuration
├── modules/
│   ├── networking/              # VPC, 2 AZs, public/private subnets, free S3 endpoint, toggleable NAT
│   ├── security/                # Security groups for ALB, App, Judge0, RDS (least privilege)
│   ├── alb/                     # Internet-facing ALB, HTTP->HTTPS redirect, ACM TLS, health checks
│   ├── application-asg/         # ARM64 launch template, ASG, instance refresh, 65% CPU target tracking
│   ├── judge0/                  # x86_64 execution host, sandboxing controls, optional future worker ASG
│   ├── rds/                     # PostgreSQL db.t4g.micro, gp3 storage, Secrets Manager credentials
│   ├── iam/                     # Least-privilege instance profiles for App and Judge0 hosts (No CloudWatch)
│   ├── monitoring/              # Open-Source monitoring config (Prometheus, Grafana, Loki, Kuma)
│   └── cost-controls/           # AWS Budgets at $25, $50, $75, $90 thresholds with notifications
├── userdata/
│   ├── app.sh.tftpl             # Application bootstrap (Node 20, PM2, Nginx, SSM, Node Exporter, Promtail)
│   └── judge0.sh.tftpl          # Judge0 bootstrap (Docker Compose, cgroups, IMDS shield, OSS Monitoring Suite)
├── scripts/
│   ├── validate.sh              # Formatting, template linting, and terraform validation
│   ├── deploy.sh                # Pre-flight checks, tfplan generation, and safe apply confirmation
│   └── rollback.sh              # Automated ASG instance refresh rollback, scale-down, RDS snapshot discovery
├── load-tests/
│   ├── codeskill-k6-load-test.js# k6 test suite for 100, 500, 1000, and 2000 concurrent students
│   └── run-load-test.sh         # Helper runner script with concurrency presets
└── README.md                    # Architecture, cost breakdown, deployment, and testing manual
```

---

## 3. Cost Profiles: Budget vs. Exam

The configuration provides a first-class `profile` variable (`"budget"` vs `"exam"`) configured in `terraform.tfvars`:

| Feature | Budget Profile (`profile = "budget"`) | Exam Profile (`profile = "exam"`) |
| :--- | :--- | :--- |
| **Primary Goal** | **Absolute minimum AWS cost** for idle / development | **Maximum throughput & resilience** during live exams |
| **App ASG Capacity** | Min: 1, Desired: 1, Max: 2 (`t4g.small`) | Min: 2, Desired: 2, Max: 4 (`t4g.small`) |
| **Judge0 Capacity** | 1 Dedicated Host (`m7i-flex.large`, 8 GiB RAM) | 1 Host + Optional Worker Fleet (when enabled) |
| **NAT Gateway** | **Disabled ($0.00/mo)**. Subnets use route to IGW with SG firewalls | **Enabled ($32.85/mo per NAT GW)** for strict private isolation |
| **S3 Gateway Endpoint** | **Enabled (Free)** - bypasses NAT Gateway | **Enabled (Free)** |
| **RDS PostgreSQL** | Single-AZ `db.t4g.micro` (1 GiB RAM, 20 GiB gp3) | Single-AZ or Multi-AZ `db.t4g.micro` / `db.t4g.small` |
| **Monitoring Stack** | Prometheus + Grafana OSS + Loki (Co-located container suite) | Prometheus + Grafana OSS + Loki |
| **Log Retention** | 7 Days (Loki local TSDB compaction with auto-pruning) | 14 Days |

---

## 4. Mumbai (`ap-south-1`) Monthly Cost Estimate

> [!NOTE]
> Pricing below reflects current AWS On-Demand rates in Mumbai (`ap-south-1`). Since February 1, 2024, AWS charges **$0.005/hour (~$3.65/month)** for all public IPv4 addresses. CloudWatch Agent and paid CloudWatch metrics/dashboards have been completely eliminated ($0.00).

### Budget Profile Breakdown (Baseline / Off-Exam)

| AWS Resource | Configuration / Sizing | Monthly Cost (USD) |
| :--- | :--- | :--- |
| **Application EC2** | 1 × `t4g.small` (ARM64, 2 vCPU, 2 GiB RAM) @ $0.0168/hr | **$12.26** |
| **Judge0 EC2** | 1 × `m7i-flex.large` (x86_64, 2 vCPU, 8 GiB RAM) @ $0.0504/hr | **$36.79** |
| **RDS PostgreSQL** | 1 × `db.t4g.micro` (Single-AZ, 20 GiB gp3) | **$13.80** |
| **EBS Storage** | 30 GiB (App) + 40 GiB (Judge0) = 70 GiB gp3 @ $0.096/GB-mo | **$6.72** |
| **Application Load Balancer** | 1 × ALB ($0.0225/hr) + 1.0 LCU baseline | **$21.40** |
| **Public IPv4 Addresses** | 2 × IPv4 (ALB public endpoints) @ $0.005/hr | **$7.30** |
| **NAT Gateway** | **$0.00** (Disabled in Budget profile) | **$0.00** |
| **S3 VPC Endpoint** | Gateway Endpoint (Free of charge) | **$0.00** |
| **Monitoring (OSS Suite)** | Prometheus, Grafana OSS, Loki, Uptime Kuma (Co-located containers) | **$0.00** |
| **AWS Budgets** | Account spending threshold alerts (Free Tier) | **$0.00** |
| **Data Transfer Out** | First 100 GB/month included in AWS Free Tier | **$0.00** |
| **Total Estimated Monthly Cost** | **Budget Baseline** | **~$98.27 / mo** |

*Note: If your AWS account is within its first 12 months, Free Tier credits apply (750 hours/month of eligible micro instances and 20 GB RDS storage), reducing the initial out-of-pocket baseline to **~$70 - $80/month**.*

---

## 5. Judge0 Sandboxing & Execution Security

Judge0 runs untrusted student code submissions. To prevent security breaches:

1. **IMDS Shielding (AWS Instance Metadata Service)**:
   - Untrusted student code could attempt to query `http://169.254.169.254/latest/meta-data/` to extract IAM instance credentials.
   - `userdata/judge0.sh.tftpl` injects an iptables rule:
     ```bash
     iptables -I DOCKER-USER -d 169.254.169.254 -j DROP
     ```
   - EC2 Launch Template enforces IMDSv2 with `http_put_response_hop_limit = 1`, blocking container processes from traversing the network bridge to metadata tokens.
2. **Network Isolation**:
   - `ENABLE_NETWORK=false` is enforced in `judge0.conf` for submission sandboxes. Code cannot make outbound socket calls.
3. **Execution Limits**:
   - `CPU_TIME_LIMIT=2.0` (Hard max: 10.0 seconds).
   - `MEMORY_LIMIT=524288` KB (512 MB per submission).
   - `MAX_PROCESSES_AND_OR_THREADS=60` (prevents fork bombs).
4. **Future Worker Auto Scaling**:
   - Controlled via `judge0_worker_autoscaling_enabled = false`.
   - Dedicated worker fleet module is included in `modules/judge0/main.tf`. It remains disabled by default until a shared Redis queue and load testing are completed.

---

## 6. AWS Budgets & Cost Controls

AWS Budgets is configured in `modules/cost-controls/` with automated notifications:
- **25% Threshold ($25)**: Early-month pacing notification.
- **50% Threshold ($50)**: Mid-month operational checkpoint.
- **75% Threshold ($75)**: High-activity alert.
- **90% Threshold ($90)**: Critical threshold alert.
- **100% Forecasted**: Triggered if projected monthly spend will exceed $100.

> [!WARNING]
> AWS Budgets notifications are informational alerts delivered via email. They are not hard spending caps and do not terminate running infrastructure. Spend data is processed by AWS billing with a 12 to 24-hour reporting delay.

---

## 7. Deployment Instructions

### Prerequisites
1. Install [Terraform >= 1.5.0](https://developer.hashicorp.com/terraform/install).
2. Install and configure [AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) with credentials having administrator/DevOps permissions in account `239939507154`.
3. Verify authentication:
   ```bash
   aws sts get-caller-identity
   ```

### Step-by-Step Deployment

```bash
# 1. Navigate to terraform directory
cd terraform

# 2. Configure variables
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars if needed (e.g., set alert_email, profile)

# 3. Validate configuration and shell templates
./scripts/validate.sh

# 4. Preview changes with safe plan generation
./scripts/deploy.sh
# Type 'YES' only when you are ready to apply changes.
```

---

## 8. Rollback Procedures

If an issue occurs after an update, run the interactive rollback utility:

```bash
cd terraform
./scripts/rollback.sh
```

Available options:
1. **Rollback ASG Instance Refresh**: Seamlessly reverts the application ASG to the previous launch template version without downtime.
2. **Cancel Instance Refresh**: Stops any rolling deployment in progress.
3. **Emergency Scale-Down**: Reduces desired capacity to 1 to relieve connection pressure.
4. **RDS Snapshot Discovery**: Lists automated RDS snapshots for point-in-time recovery.
5. **Git & Terraform State Rollback**: Guides manual rollback to a previous Git commit.

---

## 9. Concurrency & Load Testing (100 - 2,000 Students)

> [!IMPORTANT]
> Do not schedule live examinations with 2,000 students without executing the load testing suite first! The baseline database (`db.t4g.micro`) has 1 GiB RAM and is tuned for 50 max connections. Benchmarking is required to size connection pools and queue workers.

### Running Load Tests with k6

The k6 test suite in `load-tests/codeskill-k6-load-test.js` measures:
- User login latency (p50 / p95 / p99)
- Active contest retrieval response times
- Code submission latency and throughput (Python, C++, JavaScript)
- Error rates and submission queue wait times

```bash
# Test 100 concurrent students (warmup / baseline)
./load-tests/run-load-test.sh https://codeskill.novaserve.cloud 100

# Test 500 concurrent students
./load-tests/run-load-test.sh https://codeskill.novaserve.cloud 500

# Test 1,000 concurrent students
./load-tests/run-load-test.sh https://codeskill.novaserve.cloud 1000

# Test 2,000 concurrent students (examination target)
./load-tests/run-load-test.sh https://codeskill.novaserve.cloud 2000
```

### SLA / Pass Thresholds:
- **p50 Latency**: `< 500ms`
- **p95 Latency**: `< 2,000ms`
- **p99 Latency**: `< 4,000ms`
- **HTTP Error Rate**: `< 2.0%`
- **Code Submission Failures**: `< 5.0%`

---

## 10. Open-Source Monitoring & Observability (Zero CloudWatch)

Amazon CloudWatch Agent, paid custom metrics, log groups, and CloudWatch dashboards have been completely replaced with a lightweight open-source monitoring stack co-located on the Judge0 host (`m7i-flex.large`, 8 GiB RAM), requiring **zero extra EC2 instances**:

| Component | Port | Description | Memory Cap |
| :--- | :--- | :--- | :--- |
| **Prometheus** | `9090` | Timeseries metrics collection, scraping Node Exporter and PostgreSQL Exporter every 15s | 256 MB |
| **Grafana OSS** | `3001` | Unified visualization, alert rules, pre-provisioned dashboards | 256 MB |
| **Loki** | `3100` | Centralized log aggregation with 7-day TSDB auto-pruning | 256 MB |
| **Promtail** | `9080` | Log shipper on App and Judge0 hosts, shipping Nginx and app logs to Loki | 128 MB |
| **Node Exporter** | `9100` | Host-level hardware and OS metrics (CPU, Memory, Disk, Network) | 64 MB |
| **PostgreSQL Exporter** | `9187` | RDS PostgreSQL query latency, connections, buffer cache metrics | 64 MB |
| **Uptime Kuma** | `3002` | Synthetic HTTP/HTTPS uptime monitoring for platform endpoints | 128 MB |

### Accessing Grafana and Uptime Kuma Securely (No Open Public Ports)

Neither Grafana nor Uptime Kuma is exposed to the public internet. Access them securely from your local machine via **AWS Systems Manager (SSM) Port Forwarding**:

```bash
# 1. Tunnel Grafana OSS to http://localhost:3001
aws ssm start-session \
  --target $(aws ec2 describe-instances --filters "Name=tag:Name,Values=codeskill-production-judge0-host" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text --region ap-south-1) \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3001"],"localPortNumber":["3001"]}' \
  --region ap-south-1

# Open your browser: http://localhost:3001 (User: admin / Password: from terraform.tfvars)

# 2. Tunnel Uptime Kuma to http://localhost:3002
aws ssm start-session \
  --target $(aws ec2 describe-instances --filters "Name=tag:Name,Values=codeskill-production-judge0-host" "Name=instance-state-name,Values=running" --query "Reservations[0].Instances[0].InstanceId" --output text --region ap-south-1) \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3002"],"localPortNumber":["3002"]}' \
  --region ap-south-1

# Open your browser: http://localhost:3002
```

