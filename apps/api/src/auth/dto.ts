import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

// O'zbekiston raqami: +998XXXXXXXXX
const UZ_PHONE = /^\+998\d{9}$/;

export enum OtpPurposeDto {
  REGISTER = 'REGISTER',
  LOGIN = 'LOGIN',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export class SendOtpDto {
  @ApiProperty({ example: '+998901234567' })
  @Matches(UZ_PHONE, { message: 'Telefon raqam +998XXXXXXXXX formatida bo\'lishi kerak' })
  phone: string;

  @ApiProperty({ enum: OtpPurposeDto })
  @IsEnum(OtpPurposeDto)
  purpose: OtpPurposeDto;
}

export class VerifyOtpDto extends SendOtpDto {
  @ApiProperty({ example: '123456' })
  @Length(6, 6)
  code: string;
}

export class RegisterDto {
  @ApiProperty({ description: '/auth/verify-otp qaytargan verificationToken' })
  @IsString()
  verificationToken: string;

  @ApiProperty({ minLength: 8 })
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiProperty()
  @IsString()
  @Length(1, 80)
  firstName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @ApiPropertyOptional({ enum: ['uz_latn', 'uz_cyrl', 'ru'] })
  @IsOptional()
  @IsEnum(['uz_latn', 'uz_cyrl', 'ru'])
  locale?: 'uz_latn' | 'uz_cyrl' | 'ru';

  @ApiPropertyOptional({ enum: ['student', 'teacher', 'parent'], default: 'student' })
  @IsOptional()
  @IsEnum(['student', 'teacher', 'parent'])
  accountType?: 'student' | 'teacher' | 'parent';
}

export class LoginDto {
  @ApiProperty({ description: 'Telefon (+998...) yoki email' })
  @IsString()
  login: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  verificationToken: string;

  @ApiProperty({ minLength: 8 })
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class AddEmailDto {
  @ApiProperty()
  @IsEmail()
  email: string;
}
