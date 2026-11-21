import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getOtpEmailTemplate } from './templates/otp-email.template';

@Injectable()
export class EmailService {
  private readonly sesClient: SESClient;
  private readonly logger = new Logger(EmailService.name);
  private readonly isMock: boolean;
  private readonly senderEmail: string;

  constructor(private readonly configService: ConfigService) {
    const accessKey = this.configService.get<string>('aws.accessKeyId');
    const secretKey = this.configService.get<string>('aws.secretAccessKey');
    const sessionToken = this.configService.get<string>('aws.sessionToken');
    const region = this.configService.get<string>('aws.region') || 'ap-south-1';
    this.senderEmail =
      this.configService.get<string>('aws.sesSender') || 'noreply@cuchd.in';

    const sesConfig: any = { region };

    const hasCreds = !!(
      accessKey &&
      secretKey &&
      accessKey !== 'your_aws_access_key'
    );
    const isProd = process.env.NODE_ENV === 'production';
    const forceMock = process.env.USE_MOCK_SES === 'true';

    if (hasCreds) {
      sesConfig.credentials = {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
        ...(sessionToken &&
          sessionToken !== 'your_aws_session_token' && { sessionToken }),
      };
      this.logger.log('[SES] Using explicit credentials from configuration');
      this.isMock = false;
    } else if (isProd) {
      if (forceMock) {
        // The mock transport logs one-time codes; it must never run in production.
        throw new Error('USE_MOCK_SES is not permitted when NODE_ENV=production');
      }
      this.logger.log(
        '[SES] Using EC2 IAM Role / Default AWS Provider Chain in production',
      );
      this.isMock = false;
    } else {
      this.logger.warn('[SES] Using Mock SES service (non-production only)');
      this.isMock = true;
    }

    this.sesClient = new SESClient(sesConfig);
  }

  async sendOTPEmail(toEmail: string, otp: string): Promise<any> {
    const { html, text, subject } = getOtpEmailTemplate(otp);

    if (this.isMock) {
      this.logger.log(`
=========================================
[MOCK SES] Email sending bypassed
To: ${toEmail}
Subject: ${subject}
OTP CODE: ${otp}
=========================================`);
      return { MessageId: 'mock-message-id-' + Date.now() };
    }

    const params = {
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Body: {
          Html: {
            Charset: 'UTF-8',
            Data: html,
          },
          Text: {
            Charset: 'UTF-8',
            Data: text,
          },
        },
        Subject: {
          Charset: 'UTF-8',
          Data: subject,
        },
      },
      Source: this.senderEmail,
    };

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const command = new SendEmailCommand(params);
        const result = await this.sesClient.send(command);
        this.logger.log(
          `[SES] Email sent to ${toEmail}. MessageId: ${result.MessageId}`,
        );
        return result;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(
      `Failed to send OTP email to ${toEmail}. SES Error: ${lastError?.message || 'Unknown'}`,
    );
  }

  async sendCredentialEmail(
    toEmail: string,
    studentName: string,
    uid: string,
    temporaryPassword: string,
    portalUrl = 'http://localhost:3000/student-login',
  ): Promise<any> {
    const subject = `Your CodeSkill University Assessment Portal Credentials (${uid})`;

    if (this.isMock) {
      this.logger.log(`
=========================================
[MOCK SES] Credential Email
To: ${toEmail}
Name: ${studentName}
UID: ${uid}
Password: ${temporaryPassword}
Portal: ${portalUrl}
=========================================`);
      return { MessageId: 'mock-cred-message-' + Date.now() };
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
          .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #d97706, #b45309); padding: 32px 24px; text-align: center; color: #ffffff; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
          .badge { display: inline-block; background: rgba(255, 255, 255, 0.2); padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
          .content { padding: 32px 24px; }
          .greeting { font-size: 16px; font-weight: 600; margin-bottom: 16px; }
          .info-box { background: #fef3c7; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 24px 0; }
          .cred-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed #fcd34d; font-size: 14px; }
          .cred-row:last-child { border-bottom: none; }
          .cred-label { color: #92400e; font-weight: 600; }
          .cred-val { font-family: monospace; font-weight: 700; color: #78350f; font-size: 15px; }
          .btn-container { text-align: center; margin: 30px 0; }
          .btn { background-color: #f59e0b; color: #ffffff !important; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block; }
          .guidelines { background: #f8fafc; border-left: 4px solid #f59e0b; padding: 12px 16px; margin: 20px 0; font-size: 13px; color: #475569; }
          .footer { background: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CodeSkill Assessment Portal</h1>
            <div class="badge">Official Examination Credentials</div>
          </div>
          <div class="content">
            <p class="greeting">Dear ${studentName},</p>
            <p>Your institutional examination account has been registered for upcoming assessments. Below are your official login credentials:</p>
            
            <div class="info-box">
              <div class="cred-row">
                <span class="cred-label">University UID:</span>
                <span class="cred-val">${uid}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Registered Email:</span>
                <span class="cred-val">${toEmail}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Temporary Password:</span>
                <span class="cred-val">${temporaryPassword}</span>
              </div>
            </div>

            <div class="btn-container">
              <a href="${portalUrl}" class="btn" target="_blank">Access Examination Portal &rarr;</a>
            </div>

            <div class="guidelines">
              <strong>Mandatory Candidate Notice:</strong>
              <ul style="margin: 8px 0 0 0; padding-left: 20px;">
                <li>You will be required to change your temporary password on your first sign-in.</li>
                <li>Never share your examination credentials with anyone.</li>
                <li>Anti-cheating audit telemetry is active during all testing sessions.</li>
              </ul>
            </div>
          </div>
          <div class="footer">
            &copy; ${new Date().getFullYear()} CodeSkill University Assessment System. All rights reserved.<br/>
            This is an automated institutional message. Please do not reply directly.
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
CodeSkill Assessment Portal - Official Examination Credentials

Dear ${studentName},

Your examination account is ready. Below are your login credentials:
University UID: ${uid}
Temporary Password: ${temporaryPassword}
Portal URL: ${portalUrl}

Please sign in and change your password before your examination starts.
`;

    const params = {
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Body: {
          Html: { Charset: 'UTF-8', Data: htmlBody },
          Text: { Charset: 'UTF-8', Data: textBody },
        },
        Subject: { Charset: 'UTF-8', Data: subject },
      },
      Source: this.senderEmail,
    };

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const command = new SendEmailCommand(params);
        const result = await this.sesClient.send(command);
        this.logger.log(
          `[SES] Credential email sent to ${toEmail} (${uid}). MessageId: ${result.MessageId}`,
        );
        return result;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    throw new Error(
      `Failed to send credential email to ${toEmail}. SES Error: ${lastError?.message || 'Unknown'}`,
    );
  }

  async sendCertificateIssuedEmail(
    toEmail: string,
    studentName: string,
    pathTitle: string,
    credentialId: string,
    verificationUrl = `http://localhost:3000/verify/${credentialId}`,
  ): Promise<any> {
    const subject = `🎓 Congratulations ${studentName}! Your Certificate for "${pathTitle}" is Ready`;

    if (this.isMock) {
      this.logger.log(`
=========================================
[MOCK SES] Certificate Issued Email
To: ${toEmail}
Student: ${studentName}
Path: ${pathTitle}
Credential ID: ${credentialId}
Verify URL: ${verificationUrl}
=========================================`);
      return { MessageId: 'mock-cert-message-' + Date.now() };
    }

    const htmlBody = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; margin: 0; padding: 0; color: #f1f5f9; }
          .container { max-width: 620px; margin: 30px auto; background: #111827; border-radius: 16px; border: 1px solid #1f2937; overflow: hidden; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5); }
          .header { background: linear-gradient(135deg, #1e1b4b, #312e81, #4c1d95); padding: 36px 28px; text-align: center; color: #ffffff; border-bottom: 2px solid #6366f1; }
          .header h1 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; }
          .badge { display: inline-block; background: rgba(99, 102, 241, 0.25); border: 1px solid rgba(129, 140, 248, 0.4); color: #c7d2fe; padding: 6px 16px; border-radius: 9999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 10px; letter-spacing: 0.05em; }
          .content { padding: 32px 28px; }
          .greeting { font-size: 18px; font-weight: 700; color: #f8fafc; margin-bottom: 12px; }
          .info-box { background: #1e1b4b/30; border: 1px solid #3730a3; border-radius: 12px; padding: 22px; margin: 24px 0; }
          .cred-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px dashed #312e81; font-size: 14px; }
          .cred-row:last-child { border-bottom: none; }
          .cred-label { color: #a5b4fc; font-weight: 600; }
          .cred-val { font-family: monospace; font-weight: 700; color: #e0e7ff; font-size: 15px; }
          .btn-container { text-align: center; margin: 32px 0 20px 0; }
          .btn { background: linear-gradient(135deg, #4f46e5, #6366f1); color: #ffffff !important; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block; box-shadow: 0 4px 14px 0 rgba(79, 70, 229, 0.4); }
          .footer { background: #0f172a; padding: 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #1e293b; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Chandigarh University · CodeSkill</h1>
            <div class="badge">Official Certificate of Completion</div>
          </div>
          <div class="content">
            <p class="greeting">Dear ${studentName},</p>
            <p style="color: #94a3b8; line-height: 1.6; font-size: 15px;">
              Congratulations! You have successfully mastered all required curriculum milestones, practice challenges, and rigorous assessments for <strong>${pathTitle}</strong>.
            </p>
            
            <div class="info-box">
              <div class="cred-row">
                <span class="cred-label">Recipient:</span>
                <span class="cred-val">${studentName}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Learning Path:</span>
                <span class="cred-val">${pathTitle}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Verified Credential ID:</span>
                <span class="cred-val">${credentialId}</span>
              </div>
              <div class="cred-row">
                <span class="cred-label">Academic Status:</span>
                <span class="cred-val" style="color: #34d399;">Verified Distinction</span>
              </div>
            </div>

            <div class="btn-container">
              <a href="${verificationUrl}" class="btn" target="_blank">View & Download Certificate &rarr;</a>
            </div>

            <p style="color: #64748b; font-size: 13px; text-align: center; margin-top: 16px;">
              You can download a high-definition PNG/PDF or add this official credential directly to your LinkedIn profile.
            </p>
          </div>
          <div class="footer">
            <p style="margin: 0;">Chandigarh University · Department of Computer Science & Engineering · Apex Institute of Technology</p>
            <p style="margin: 4px 0 0 0; color: #475569;">NAAC Grade A+ Accredited University · Punjab, India</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const textBody = `
Congratulations ${studentName}!

You have successfully completed ${pathTitle} on CodeSkill (Chandigarh University).
Credential ID: ${credentialId}
View & Download your certificate here: ${verificationUrl}
    `.trim();

    const params = {
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Body: {
          Html: { Charset: 'UTF-8', Data: htmlBody },
          Text: { Charset: 'UTF-8', Data: textBody },
        },
        Subject: { Charset: 'UTF-8', Data: subject },
      },
      Source: this.senderEmail,
    };

    const maxRetries = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const command = new SendEmailCommand(params);
        const result = await this.sesClient.send(command);
        this.logger.log(
          `[SES] Certificate email sent to ${toEmail} (${credentialId}). MessageId: ${result.MessageId}`,
        );
        return result;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    this.logger.warn(
      `Could not send certificate email to ${toEmail}: ${lastError?.message || 'Unknown error'}`,
    );
    return null;
  }
}
