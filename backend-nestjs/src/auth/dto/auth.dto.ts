import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsNotEmpty,
  IsIn,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters' })
  password: string;

  @IsString()
  otp: string;
}

export class LoginDto {
  @IsString()
  email: string;

  @IsString()
  password: string;
}

export class AdminLoginDto {
  @IsString()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  newPassword: string;
}

export class SendOtpDto {
  @IsEmail()
  email: string;
}

export class VerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  code: string;

  @IsString()
  name?: string;
}

export class AdminVerifyOtpDto {
  @IsEmail()
  email: string;

  @IsString()
  otp: string;
}

export class OAuthDto {
  @IsString()
  token: string;
}

export class GithubAuthDto {
  @IsString()
  code: string;
}

export class LinkedinAuthDto {
  @IsString()
  code: string;

  @IsString()
  redirectUri: string;
}

export class StartSocialAccountLinkDto {
  @IsIn(['github'])
  provider: 'github';

  @IsString()
  @IsNotEmpty()
  redirectUri: string;
}

export class CompleteSocialAccountLinkDto extends StartSocialAccountLinkDto {
  @IsString()
  @IsNotEmpty()
  code: string;

  @IsString()
  @IsNotEmpty()
  state: string;
}

export class StudentLoginDto {
  @IsString()
  uid: string;

  @IsString()
  password: string;
}

export class ForceChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  newPassword: string;
}

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  @IsOptional()
  refreshToken?: string;
}

