import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  InternalServerErrorException,
  ConflictException,
  Optional,
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
import { randomBytes } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { isOriginAllowed, resolveAllowedCorsOrigins } from '../common/cors.util';
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
  StartSocialAccountLinkDto,
  CompleteSocialAccountLinkDto,
} from './dto/auth.dto';

function escapeIlike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

type SocialLinkProvider = 'github';
type SocialLinkState = {
  userId: string;
  provider: SocialLinkProvider;
  redirectUri: string;
};

function isSocialProfileUrl(value: string, domain: 'github.com'): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      (hostname === domain || hostname === `www.${domain}`) &&
      url.pathname.split('/').filter(Boolean).length > 0
    );
  } catch {
    return false;
  }
}

function isSocialAvatarUrl(
  value: unknown,
  providerDomain: 'githubusercontent.com',
): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (hostname === providerDomain || hostname.endsWith(`.${providerDomain}`))
    );
  } catch {
    return false;
  }
}


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
    @Optional() private readonly redisService?: RedisService,
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
    if (!raw) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.loginThrottleService.assertAllowed(raw, ip);

    const escaped = escapeIlike(raw);
    const user = await this.userRepository.findOne({
      where: [
        { email: ILike(escaped) },
        { name: ILike(escaped) },
        { uid: ILike(escaped) },
        { username: ILike(escaped) },
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
    if (!raw) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.loginThrottleService.assertAllowed(raw, ip);

    const escaped = escapeIlike(raw);
    const user = await this.userRepository.findOne({
      where: [
        { email: ILike(escaped) },
        { name: ILike(escaped) },
        { uid: ILike(escaped) },
        { username: ILike(escaped) },
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
    if (!raw) {
      throw new UnauthorizedException('Invalid credentials');
    }
    await this.loginThrottleService.assertAllowed(raw, ip);

    const escaped = escapeIlike(raw);
    const user = await this.userRepository.findOne({
      where: [
        { uid: ILike(escaped) },
        { email: ILike(escaped) },
        { username: ILike(escaped) },
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
    const isGoogleEnabled = this.configService.get<boolean>('oauth.googleEnabled');
    if (!isGoogleEnabled) {
      throw new UnauthorizedException('Google Sign-In is disabled.');
    }

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

  async logout(userId: string | undefined, dto?: LogoutDto) {
    if (dto?.refreshToken) {
      // Always revoke the specific refresh token family when a token is provided.
      // This works even if the access token is expired (userId may be undefined).
      await this.tokenService.revokeRefreshToken(dto.refreshToken);
    } else if (userId) {
      // Full session invalidation: requires a valid userId from the access token.
      await this.tokenService.invalidateUserSessions(userId);
    }
    this.logger.log({
      event: 'AUTH_LOGOUT',
      userId: userId ?? 'unknown',
      revokedSingleToken: !!dto?.refreshToken,
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');
    return user;
  }

  private validateSocialRedirectUri(
    redirectUri: string,
    provider: SocialLinkProvider,
  ): string {
    let parsed: URL;
    try {
      parsed = new URL(redirectUri);
    } catch {
      throw new BadRequestException('Invalid social account callback URL');
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      parsed.pathname !== '/profile' ||
      parsed.search !== `?social=${provider}` ||
      (isProduction && parsed.protocol !== 'https:') ||
      (!isProduction && parsed.protocol !== 'https:' && !isLocalHost) ||
      !isOriginAllowed(parsed.origin, resolveAllowedCorsOrigins(), isProduction)
    ) {
      throw new BadRequestException('Social account callback URL is not allowed');
    }
    return parsed.toString();
  }

  private socialLinkStateKey(provider: SocialLinkProvider, state: string): string {
    return `auth:social-link:${provider}:${state}`;
  }

  async startSocialAccountLink(
    userId: string,
    dto: StartSocialAccountLinkDto,
  ) {
    const provider = dto.provider;
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Your account is not active');
    }
    if (user.isAssessmentStudent) {
      throw new BadRequestException(
        'Assessment student accounts cannot connect social accounts.',
      );
    }
    if (!this.redisService) {
      throw new InternalServerErrorException(
        'Social account linking is temporarily unavailable',
      );
    }

    const redirectUri = this.validateSocialRedirectUri(dto.redirectUri, provider);
    const clientId = this.configService.get<string>(`oauth.${provider}ClientId`);
    const clientSecret = this.configService.get<string>(`oauth.${provider}ClientSecret`);
    if (
      !clientId ||
      !clientSecret ||
      /^(your_|replace|changeme|default)/i.test(clientId) ||
      /^(your_|replace|changeme|default)/i.test(clientSecret)
    ) {
      throw new BadRequestException(
        `GitHub OAuth is not configured on this server.`,
      );
    }

    const state = randomBytes(32).toString('hex');
    const stateValue: SocialLinkState = { userId, provider, redirectUri };
    try {
      const stored = await this.redisService
        .getClient()
        .set(this.socialLinkStateKey(provider, state), JSON.stringify(stateValue), 'EX', 600, 'NX');
      if (stored !== 'OK') throw new Error('OAuth state was not stored');
    } catch {
      throw new InternalServerErrorException(
        'Unable to start social account linking. Please try again.',
      );
    }

    const authorizationUrl = new URL('https://github.com/login/oauth/authorize');
    authorizationUrl.searchParams.set('response_type', 'code');
    authorizationUrl.searchParams.set('client_id', clientId);
    authorizationUrl.searchParams.set('redirect_uri', redirectUri);
    authorizationUrl.searchParams.set('state', state);
    authorizationUrl.searchParams.set(
      'scope',
      'read:user',
    );

    return { authorizationUrl: authorizationUrl.toString() };
  }

  async completeSocialAccountLink(
    userId: string,
    dto: CompleteSocialAccountLinkDto,
  ) {
    const provider = dto.provider;
    if (!this.redisService) {
      throw new InternalServerErrorException(
        'Social account linking is temporarily unavailable',
      );
    }
    const redirectUri = this.validateSocialRedirectUri(dto.redirectUri, provider);
    let stateJson: string | null;
    try {
      stateJson = (await this.redisService.getClient().eval(
        "local value = redis.call('GET', KEYS[1]); if value then redis.call('DEL', KEYS[1]); end; return value",
        1,
        this.socialLinkStateKey(provider, dto.state),
      )) as string | null;
    } catch {
      throw new InternalServerErrorException(
        'Unable to verify the social account authorization. Please try again.',
      );
    }
    if (!stateJson) {
      throw new UnauthorizedException(
        'Social authorization expired or was already used. Please try again.',
      );
    }

    let state: SocialLinkState;
    try {
      state = JSON.parse(stateJson) as SocialLinkState;
    } catch {
      throw new UnauthorizedException('Invalid social authorization state');
    }
    if (
      state.userId !== userId ||
      state.provider !== provider ||
      state.redirectUri !== redirectUri
    ) {
      throw new UnauthorizedException(
        'Social authorization does not match the signed-in account.',
      );
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user || user.isActive === false) {
      throw new UnauthorizedException('Your account is not active');
    }

    const clientId = this.configService.get<string>(`oauth.${provider}ClientId`);
    const clientSecret = this.configService.get<string>(`oauth.${provider}ClientSecret`);

    try {
      if (provider === 'github') {
        const tokenResponse = await axios.post(
          'https://github.com/login/oauth/access_token',
          {
            client_id: clientId,
            client_secret: clientSecret,
            code: dto.code,
            redirect_uri: redirectUri,
          },
          { headers: { Accept: 'application/json' } },
        );
        const accessToken = tokenResponse.data.access_token;
        if (!accessToken) throw new Error('GitHub did not return an access token');

        const profileResponse = await axios.get('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const { id, login, html_url: htmlUrl, avatar_url: avatarUrl } = profileResponse.data;
        if (id === undefined || !login) throw new Error('GitHub profile is incomplete');
        const githubId = String(id);
        const existingOwner = await this.userRepository.findOne({ where: { githubId } });
        if (existingOwner && existingOwner.id !== user.id) {
          throw new ConflictException('This GitHub account is already connected to another CodeSkill account.');
        }
        if (user.githubId && user.githubId !== githubId) {
          throw new ConflictException('A different GitHub account is already connected.');
        }

        user.githubId = githubId;
        user.profile = {
          ...(user.profile || {}),
          githubUsername: login,
          githubUrl: isSocialProfileUrl(String(htmlUrl || ''), 'github.com')
            ? String(htmlUrl)
            : `https://github.com/${encodeURIComponent(login)}`,
          githubAvatarUrl: isSocialAvatarUrl(avatarUrl, 'githubusercontent.com')
            ? avatarUrl
            : '',
        };
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      this.logger.warn(
        `GitHub account link failed: ${(error as Error)?.message || 'unknown error'}`,
      );
      throw new UnauthorizedException(
        'Could not verify the GitHub authorization. Please try again.',
      );
    }

    return this.userRepository.save(user);
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
      'githubUrl',
    ];

    for (const key of allowedFields) {
      if (data[key] !== undefined) (user as any)[key] = data[key];
    }

    if (data.profile) {
      if (!user.profile) user.profile = {};
      for (const key of allowedProfileFields) {
        if (data.profile[key] !== undefined) {
          if (key === 'githubUrl') {
            const value = String(data.profile[key]).trim();
            const domain = 'github.com';
            if (value && !isSocialProfileUrl(value, domain)) {
              throw new BadRequestException(
                `GitHub profile must be a valid HTTPS profile URL on ${domain}`,
              );
            }
            (user.profile as any)[key] = value;
            continue;
          }
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

    const refreshedUser = await this.userRepository.findOne({
      where: { id: user.id },
    });
    const tokens = await this.tokenService.issueTokens(refreshedUser || user);

    return {
      success: true,
      token: tokens.token,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      message: 'Password successfully updated',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role || (user.isAdmin ? 'admin' : 'student'),
        isAdmin: user.isAdmin,
        uid: user.uid,
        isAssessmentStudent: user.isAssessmentStudent || false,
        forcePasswordChange: false,
      },
    };
  }
}
