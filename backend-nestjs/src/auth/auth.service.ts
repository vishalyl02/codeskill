import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { User as UserEntity } from '../database/entities/user.entity';
import { OtpService } from '../redis/otp.service';
import { TokenService } from './token.service';
import { LoginThrottleService } from './login-throttle.service';
import { validatePasswordPolicy } from './password.util';
import { OAuth2Client } from 'google-auth-library';
import axios from 'axios';
import {
  RegisterDto,
  LoginDto,
  SendOtpDto,
  VerifyOtpDto,
  OAuthDto,
  GithubAuthDto,
  LinkedinAuthDto,
  AdminLoginDto,
  AdminVerifyOtpDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  StudentLoginDto,
  ForceChangePasswordDto,
  RefreshTokenDto,
  LogoutDto,
} from './dto/auth.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private googleClient: OAuth2Client;

  constructor(
    @InjectRepository(UserEntity) private userRepository: Repository<UserEntity>,
    private otpService: OtpService,
    private configService: ConfigService,
    private tokenService: TokenService,
    private loginThrottleService: LoginThrottleService,
  ) {
    this.googleClient = new OAuth2Client(
      this.configService.get<string>('oauth.googleClientId'),
    );
  }

  private async authResponse(user: UserEntity) {
    const tokens = await this.tokenService.issueTokens(user);
    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || (user.isAdmin ? 'admin' : 'student'),
        isAdmin: user.isAdmin,
        uid: user.uid || null,
        isAssessmentStudent: user.isAssessmentStudent || false,
        forcePasswordChange: user.forcePasswordChange || false,
        studentProfile: user.studentProfile || null,
        avatar: user.avatar,
        bio: user.bio,
        profile: user.profile,
        stats: user.stats,
        authProvider: user.authProvider,
      },
    };
  }

  async sendRegistrationOtp(dto: SendOtpDto) {
    throw new BadRequestException(
      'Public registration is currently disabled. Please contact your administrator.',
    );
  }

  async register(dto: RegisterDto) {
    throw new BadRequestException(
      'Public registration is currently disabled. Please contact your administrator.',
    );
  }

  async sendOtp(dto: SendOtpDto) {
    throw new BadRequestException(
      'Passwordless login is disabled for security. Please sign in with your password.',
    );
  }

  async verifyOtp(dto: VerifyOtpDto) {
    throw new BadRequestException(
      'Passwordless login is disabled for security. Please sign in with your password.',
    );
  }

  async login(dto: LoginDto, ip?: string) {
    const raw = (dto.email || '').trim();
    await this.loginThrottleService.assertAllowed(raw, ip);

    const user = await this.userRepository.findOne({
      where: [
        { email: ILike(raw) },
        { uid: ILike(raw) },
        { username: ILike(raw) },
        { name: ILike(raw) },
        { email: ILike(`${raw}@%`) },
      ],
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isAdmin: true,
        uid: true,
        isAssessmentStudent: true,
        forcePasswordChange: true,
        studentProfile: true,
        avatar: true,
        bio: true,
        profile: true,
        stats: true,
        authProvider: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_LOGIN_FAILED',
        email: raw,
        reason: 'User not found',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isActive === false) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_LOGIN_FAILED',
        email: raw,
        userId: user.id,
        reason: 'Account deactivated',
        ip,
      });
      throw new UnauthorizedException(
        'Your account has been deactivated. Please contact your administrator.',
      );
    }

    if (user.authProvider !== 'local' && !user.password) {
      this.logger.warn({
        event: 'AUTH_LOGIN_FAILED',
        email: raw,
        userId: user.id,
        reason: `Social provider required: ${user.authProvider}`,
        ip,
      });
      throw new UnauthorizedException(
        `Please login using ${user.authProvider}`,
      );
    }

    const isMatch = await user.matchPassword(dto.password);
    if (!isMatch) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_LOGIN_FAILED',
        email: raw,
        userId: user.id,
        reason: 'Invalid password',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginThrottleService.recordSuccess(raw);
    user.lastActive = new Date();
    await this.userRepository.save(user);

    this.logger.log({
      event: 'AUTH_LOGIN_SUCCESS',
      userId: user.id,
      email: user.email,
      role: user.role || (user.isAdmin ? 'admin' : 'student'),
      ip,
    });

    return await this.authResponse(user);
  }

  async adminLogin(dto: AdminLoginDto, ip?: string) {
    const raw = (dto.email || '').trim();
    await this.loginThrottleService.assertAllowed(raw, ip);

    const user = await this.userRepository.findOne({
      where: [
        { email: ILike(raw) },
        { uid: ILike(raw) },
        { username: ILike(raw) },
        { name: ILike(raw) },
        { email: ILike(`${raw}@%`) },
      ],
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isAdmin: true,
        uid: true,
        isAssessmentStudent: true,
        forcePasswordChange: true,
        studentProfile: true,
        avatar: true,
        bio: true,
        profile: true,
        stats: true,
        authProvider: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (
      !user ||
      !user.isAdmin ||
      user.isActive !== true ||
      !user.password ||
      typeof dto.password !== 'string' ||
      !dto.password
    ) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_ADMIN_LOGIN_FAILED',
        email: raw,
        reason: 'Invalid credentials or inactive admin',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isMatch = await user.matchPassword(dto.password);
    if (!isMatch) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_ADMIN_LOGIN_FAILED',
        email: raw,
        userId: user.id,
        reason: 'Invalid password',
        ip,
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.loginThrottleService.recordSuccess(raw);
    user.lastActive = new Date();
    await this.userRepository.save(user);

    this.logger.log({
      event: 'AUTH_ADMIN_LOGIN_SUCCESS',
      userId: user.id,
      email: user.email,
      role: 'admin',
      ip,
    });

    return await this.authResponse(user);
  }

  async adminVerifyOtp(dto: AdminVerifyOtpDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    await this.otpService.verifyOTP(normalizedEmail, dto.otp, 'admin_login');

    const user = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (!user || !user.isAdmin || user.isActive !== true) {
      throw new UnauthorizedException('Access denied');
    }

    user.lastActive = new Date();
    await this.userRepository.save(user);

    return await this.authResponse(user);
  }

  async studentLogin(dto: StudentLoginDto, ip?: string) {
    const raw = (dto.uid || '').trim();
    await this.loginThrottleService.assertAllowed(raw, ip);

    const user = await this.userRepository.findOne({
      where: [
        { uid: ILike(raw) },
        { email: ILike(raw) },
        { username: ILike(raw) },
        { name: ILike(raw) },
        { email: ILike(`${raw}@%`) },
      ],
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        role: true,
        isAdmin: true,
        uid: true,
        isAssessmentStudent: true,
        forcePasswordChange: true,
        studentProfile: true,
        avatar: true,
        bio: true,
        profile: true,
        stats: true,
        authProvider: true,
        isActive: true,
        tokenVersion: true,
      },
    });

    if (!user) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_STUDENT_LOGIN_FAILED',
        uid: raw,
        reason: 'Student not found',
        ip,
      });
      throw new UnauthorizedException('Invalid University UID or password');
    }

    if (user.isActive === false) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_STUDENT_LOGIN_FAILED',
        uid: raw,
        userId: user.id,
        reason: 'Account deactivated',
        ip,
      });
      throw new UnauthorizedException(
        'Your student account has been deactivated. Please contact your institution administrator.',
      );
    }

    const isMatch = await user.matchPassword(dto.password);
    if (!isMatch) {
      await this.loginThrottleService.recordFailure(raw, ip);
      this.logger.warn({
        event: 'AUTH_STUDENT_LOGIN_FAILED',
        uid: raw,
        userId: user.id,
        reason: 'Invalid password',
        ip,
      });
      throw new UnauthorizedException('Invalid University UID or password');
    }

    await this.loginThrottleService.recordSuccess(raw);
    user.lastActive = new Date();
    await this.userRepository.save(user);

    this.logger.log({
      event: 'AUTH_STUDENT_LOGIN_SUCCESS',
      userId: user.id,
      uid: user.uid,
      email: user.email,
      ip,
    });

    return await this.authResponse(user);
  }

  async googleLogin(dto: OAuthDto) {
    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: dto.token,
        audience: this.configService.get<string>('oauth.googleClientId'),
      });
      payload = ticket.getPayload();
    } catch (e) {
      try {
        const response = await axios.get(
          'https://www.googleapis.com/oauth2/v3/userinfo',
          {
            headers: { Authorization: `Bearer ${dto.token}` },
          },
        );
        payload = response.data;
      } catch (err) {
        throw new UnauthorizedException('Invalid Google token');
      }
    }

    const { email, name, sub, picture } = payload;
    let user = await this.userRepository.findOne({ where: { email } });

    if (user) {
      if (user.isAssessmentStudent) {
        throw new UnauthorizedException(
          'Assessment students cannot use social login. Please log in using your University UID and password.',
        );
      }
      if (user.isActive === false) {
        throw new UnauthorizedException(
          'Your account has been deactivated. Please contact your administrator.',
        );
      }
      if (!user.googleId) {
        user.googleId = sub;
        if (!user.avatar) user.avatar = picture;
        await this.userRepository.save(user);
      }
    } else {
      throw new UnauthorizedException(
        'Account not found. Sign-up is disabled. Please contact your administrator.',
      );
    }

    return await this.authResponse(user);
  }

  async githubLogin(dto: GithubAuthDto) {
    try {
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: this.configService.get<string>('oauth.githubClientId'),
          client_secret: this.configService.get<string>(
            'oauth.githubClientSecret',
          ),
          code: dto.code,
        },
        { headers: { Accept: 'application/json' } },
      );

      const accessToken = tokenResponse.data.access_token;
      if (!accessToken) throw new Error('No access token from GitHub');

      const userResponse = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const emailsResponse = await axios.get(
        'https://api.github.com/user/emails',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const primaryEmail =
        emailsResponse.data.find((e: any) => e.primary)?.email ||
        emailsResponse.data[0]?.email;
      const { id, name, login, avatar_url } = userResponse.data;

      let user = await this.userRepository.findOne({ where: { email: primaryEmail } });
      if (user) {
        if (user.isActive === false) {
          throw new UnauthorizedException(
            'Your account has been deactivated. Please contact your administrator.',
          );
        }
        if (user.isAssessmentStudent) {
          throw new UnauthorizedException(
            'Assessment students cannot use social login. Please log in using your University UID and password.',
          );
        }
        if (!user.githubId) {
          user.githubId = id.toString();
          if (!user.avatar) user.avatar = avatar_url;
          await this.userRepository.save(user);
        }
      } else {
        throw new UnauthorizedException(
          'Account not found. Sign-up is disabled. Please contact your administrator.',
        );
      }

      return await this.authResponse(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('GitHub authentication failed');
    }
  }

  async linkedinLogin(dto: LinkedinAuthDto) {
    try {
      const tokenResponse = await axios.post(
        'https://www.linkedin.com/oauth/v2/accessToken',
        null,
        {
          params: {
            grant_type: 'authorization_code',
            code: dto.code,
            client_id: this.configService.get<string>('oauth.linkedinClientId'),
            client_secret: this.configService.get<string>(
              'oauth.linkedinClientSecret',
            ),
            redirect_uri: dto.redirectUri,
          },
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        },
      );

      const accessToken = tokenResponse.data.access_token;

      const userResponse = await axios.get(
        'https://api.linkedin.com/v2/userinfo',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const { sub, name, email, picture } = userResponse.data;

      let user = await this.userRepository.findOne({ where: { email } });
      if (user) {
        if (user.isActive === false) {
          throw new UnauthorizedException(
            'Your account has been deactivated. Please contact your administrator.',
          );
        }
        if (user.isAssessmentStudent) {
          throw new UnauthorizedException(
            'Assessment students cannot use social login. Please log in using your University UID and password.',
          );
        }
        if (!user.linkedinId) {
          user.linkedinId = sub;
          if (!user.avatar) user.avatar = picture;
          await this.userRepository.save(user);
        }
      } else {
        throw new UnauthorizedException(
          'Account not found. Sign-up is disabled. Please contact your administrator.',
        );
      }

      return await this.authResponse(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('LinkedIn authentication failed');
    }
  }

  async refreshToken(dto: RefreshTokenDto) {
    const rotated = await this.tokenService.rotate(dto.refreshToken);
    this.logger.log({
      event: 'AUTH_TOKEN_REFRESH',
      userId: rotated.user.id,
    });
    return {
      token: rotated.token,
      refreshToken: rotated.refreshToken,
      expiresIn: rotated.expiresIn,
      user: {
        id: rotated.user.id,
        name: rotated.user.name,
        email: rotated.user.email,
        role: rotated.user.role || (rotated.user.isAdmin ? 'admin' : 'student'),
        isAdmin: rotated.user.isAdmin,
      },
    };
  }

  async logout(userId: string, dto?: LogoutDto) {
    if (dto?.refreshToken) {
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
    } else {
      await this.tokenService.invalidateUserSessions(userId);
    }
    this.logger.log({
      event: 'AUTH_LOGOUT',
      userId,
      revokedSingleToken: !!dto?.refreshToken,
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: any) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const allowedFields = ['name', 'bio', 'avatar', 'username'];
    const allowedProfileFields = [
      'institution',
      'role',
      'preferredLanguage',
      'theme',
      'fontSize',
    ];

    for (const key of allowedFields) {
      if (data[key] !== undefined) (user as any)[key] = data[key];
    }

    if (data.profile) {
      for (const key of allowedProfileFields) {
        if (data.profile[key] !== undefined) {
          if (!user.profile) user.profile = {};
          (user.profile as any)[key] = data.profile[key];
        }
      }
    }

    if (data.username) {
      const usernameRegex = /^[a-z0-9_]+$/;
      if (!usernameRegex.test(data.username)) {
        throw new BadRequestException(
          'Username can only contain lowercase letters, numbers, and underscores',
        );
      }

      const existingUser = await this.userRepository.createQueryBuilder('user')
        .where('user.username = :username', { username: data.username })
        .andWhere('user.id != :id', { id: userId })
        .getOne();
      
      if (existingUser) {
        throw new BadRequestException('Username is already taken');
      }
      user.username = data.username;
    }

    return await this.userRepository.save(user);
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email: normalizedEmail } });
    if (!user) {
      throw new BadRequestException('No user found with this email address');
    }
    if (user.isAssessmentStudent) {
      throw new BadRequestException(
        'Assessment students cannot reset password online. Please contact your institution administrator.',
      );
    }
    await this.otpService.sendOTP(normalizedEmail, 'password_reset');
    return {
      success: true,
      message: 'Password reset OTP sent to your email via SES',
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();
    const passwordError = validatePasswordPolicy(dto.newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    await this.otpService.verifyOTP(normalizedEmail, dto.otp, 'password_reset');
    const user = await this.userRepository.findOne({
      where: { email: normalizedEmail },
      select: { id: true, password: true, tokenVersion: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    user.password = dto.newPassword;
    await this.userRepository.save(user);
    // Invalidate all existing sessions on password reset
    await this.tokenService.invalidateUserSessions(user.id);
    this.logger.log({
      event: 'AUTH_PASSWORD_CHANGED',
      userId: user.id,
      email: user.email,
      reason: 'reset_otp',
    });
    return { success: true, message: 'Password has been successfully reset' };
  }

  async updateAvatar(userId: string, avatarUrl: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    user.avatar = avatarUrl;
    await this.userRepository.save(user);
    return user;
  }

  async forceChangePassword(userId: string, dto: ForceChangePasswordDto) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: { id: true, name: true, email: true, uid: true, password: true, forcePasswordChange: true, tokenVersion: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const isMatch = await user.matchPassword(dto.currentPassword);
    if (!isMatch) {
      throw new BadRequestException('Current temporary password is incorrect');
    }
    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current temporary password',
      );
    }
    const passwordError = validatePasswordPolicy(dto.newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }
    user.password = dto.newPassword;
    user.forcePasswordChange = false;
    await this.userRepository.save(user);
    // Invalidate prior sessions
    await this.tokenService.invalidateUserSessions(user.id);
    this.logger.log({
      event: 'AUTH_PASSWORD_CHANGED',
      userId: user.id,
      email: user.email,
      reason: 'force_change',
    });

    return {
      success: true,
      message: 'Password successfully updated',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        uid: user.uid,
        forcePasswordChange: false,
      },
    };
  }
}
