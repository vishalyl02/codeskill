import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface AlertPayload {
  action: string;
  severity: 'WARNING' | 'CRITICAL';
  riskWeight: number;
  actorName?: string;
  actorEmail?: string;
  actorUid?: string;
  target?: string;
  targetType?: string;
  ipAddress?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

@Injectable()
export class AlertWebhookService {
  private readonly logger = new Logger(AlertWebhookService.name);
  private webhookUrl: string | null = null;
  private minRiskWeight = 3; // Trigger on High (3) and Critical (4+)

  constructor(private readonly configService: ConfigService) {
    this.webhookUrl =
      process.env.ALERT_WEBHOOK_URL ||
      this.configService.get<string>('ALERT_WEBHOOK_URL') ||
      null;
  }

  /**
   * Set custom webhook URL dynamically if needed
   */
  setWebhookUrl(url: string | null): void {
    this.webhookUrl = url;
  }

  /**
   * Asynchronously send an alert to the configured webhook.
   * Completely non-blocking with 2.5s timeout. Never blocks student requests.
   */
  async sendAlert(alert: AlertPayload): Promise<boolean> {
    if (!this.webhookUrl) {
      return false;
    }

    if (alert.riskWeight < this.minRiskWeight) {
      return false;
    }

    const timeStr = (alert.timestamp || new Date()).toISOString();
    const isSlack = this.webhookUrl.includes('hooks.slack.com');
    const isDiscord = this.webhookUrl.includes('discord.com/api/webhooks');

    let body: any;

    if (isSlack) {
      body = {
        text: `🚨 [${alert.severity}] ${alert.action} detected on CodeSkill`,
        attachments: [
          {
            color: alert.severity === 'CRITICAL' ? '#E11D48' : '#F59E0B',
            title: `Security Alert: ${alert.action}`,
            fields: [
              { title: 'Severity', value: `${alert.severity} (Risk: ${alert.riskWeight})`, short: true },
              { title: 'Actor', value: `${alert.actorName || 'Unknown'} (${alert.actorUid || alert.actorEmail || 'N/A'})`, short: true },
              { title: 'Target', value: `${alert.targetType || 'System'}: ${alert.target || 'N/A'}`, short: true },
              { title: 'Client IP', value: alert.ipAddress || 'Unknown', short: true },
              { title: 'Details', value: JSON.stringify(alert.details || {}, null, 2), short: false },
            ],
            footer: 'CodeSkill Activity Command Center',
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      };
    } else if (isDiscord) {
      body = {
        content: `🚨 **[${alert.severity}] Security Alert on CodeSkill**`,
        embeds: [
          {
            title: alert.action,
            color: alert.severity === 'CRITICAL' ? 14753096 : 16096779,
            fields: [
              { name: 'Severity', value: `${alert.severity} (Risk ${alert.riskWeight})`, inline: true },
              { name: 'Actor', value: `${alert.actorName || 'N/A'} (${alert.actorUid || alert.actorEmail || 'N/A'})`, inline: true },
              { name: 'Target', value: `${alert.targetType || 'System'}: ${alert.target || 'N/A'}`, inline: true },
              { name: 'Client IP', value: alert.ipAddress || 'Unknown', inline: true },
              { name: 'Details', value: `\`\`\`json\n${JSON.stringify(alert.details || {}, null, 2).slice(0, 800)}\n\`\`\`` },
            ],
            timestamp: timeStr,
          },
        ],
      };
    } else {
      // Standard JSON Webhook
      body = {
        event: alert.action,
        severity: alert.severity,
        riskWeight: alert.riskWeight,
        timestamp: timeStr,
        actor: {
          name: alert.actorName,
          email: alert.actorEmail,
          uid: alert.actorUid,
        },
        target: {
          type: alert.targetType,
          label: alert.target,
        },
        network: {
          ipAddress: alert.ipAddress,
        },
        details: alert.details || {},
      };
    }

    // Fire non-blocking POST request with strict 2,500ms timeout
    try {
      await axios.post(this.webhookUrl, body, {
        timeout: 2500,
        headers: { 'Content-Type': 'application/json' },
      });
      return true;
    } catch (err: any) {
      this.logger.warn(`Failed to dispatch alert webhook: ${err?.message || err}`);
      return false;
    }
  }
}
