import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ExecutionAdmissionService } from '../../execution/admission/execution-admission.service';

@Injectable()
export class SubmissionRateLimitGuard implements CanActivate {
  constructor(private readonly admission: ExecutionAdmissionService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ method: string; user?: { id?: string; _id?: string } }>();
    if (request.method === 'GET') return true;
    if (!(request.user?.id || request.user?._id))
      throw new UnauthorizedException();
    // Reservation happens after payload validation in the service/controller.
    // This guard never creates a lease that a rejected HTTP request could leak.
    await this.admission.assertReady();
    return true;
  }
}
