import { Body, Controller, Get, Injectable, Module, Param, ParseUUIDPipe, Patch, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { AccessService } from '../common/access/access.service';
import { AuthUser, CurrentUser } from '../common/decorators';
import { PrismaService } from '../common/prisma/prisma.service';

export class UpdateMeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(80) region?: string;
  @ApiPropertyOptional({ enum: ['uz_latn', 'uz_cyrl', 'ru'] })
  @IsOptional() @IsEnum(['uz_latn', 'uz_cyrl', 'ru']) locale?: 'uz_latn' | 'uz_cyrl' | 'ru';
}

export class StudentProfileDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(11) grade?: number;
  @ApiPropertyOptional({ example: '2027-05-20' }) @IsOptional() @IsDateString() examDate?: string;
  @ApiPropertyOptional({ description: 'Kunlik bo\'sh vaqt (daqiqa)' }) @IsOptional() @IsInt() @Min(10) @Max(600) dailyMinutes?: number;
}

export class SubjectChoiceDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional({ enum: ['A+', 'A', 'B+', 'B', 'C+', 'C'] })
  @IsOptional() @IsEnum(['A+', 'A', 'B+', 'B', 'C+', 'C']) targetLevel?: string;
}

export class SetSubjectsDto {
  @ApiProperty({ type: [SubjectChoiceDto] })
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SubjectChoiceDto)
  subjects: SubjectChoiceDto[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private readonly access: AccessService) {}

  me(userId: string) {
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, phone: true, email: true, locale: true, profile: true, studentProfile: true },
    });
  }

  async updateMe(userId: string, dto: UpdateMeDto) {
    const { locale, ...profile } = dto;
    await this.prisma.user.update({
      where: { id: userId },
      data: { ...(locale ? { locale } : {}), profile: Object.keys(profile).length ? { update: profile } : undefined },
    });
    return this.me(userId);
  }

  async updateStudentProfile(userId: string, dto: StudentProfileDto) {
    const data = { ...dto, examDate: dto.examDate ? new Date(dto.examDate) : undefined };
    return this.prisma.studentProfile.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  }

  async setSubjects(userId: string, dto: SetSubjectsDto) {
    await this.prisma.$transaction([
      this.prisma.studentSubject.deleteMany({ where: { userId } }),
      this.prisma.studentSubject.createMany({
        data: dto.subjects.map((s) => ({ userId, subjectId: s.subjectId, targetLevel: s.targetLevel })),
      }),
    ]);
    return this.getSubjects(userId);
  }

  getSubjects(userId: string) {
    return this.prisma.studentSubject.findMany({ where: { userId }, include: { subject: true } });
  }

  async getUser(viewerId: string, userId: string) {
    await this.access.assertCanViewStudent(viewerId, userId);
    return this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, locale: true, createdAt: true, profile: true, studentProfile: true },
    });
  }
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me') me(@CurrentUser() u: AuthUser) { return this.users.me(u.id); }
  @Patch('me') update(@CurrentUser() u: AuthUser, @Body() dto: UpdateMeDto) { return this.users.updateMe(u.id, dto); }
  @Patch('me/student-profile') student(@CurrentUser() u: AuthUser, @Body() dto: StudentProfileDto) { return this.users.updateStudentProfile(u.id, dto); }
  @Get('me/subjects') subjects(@CurrentUser() u: AuthUser) { return this.users.getSubjects(u.id); }
  @Put('me/subjects') setSubjects(@CurrentUser() u: AuthUser, @Body() dto: SetSubjectsDto) { return this.users.setSubjects(u.id, dto); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.users.getUser(u.id, id); }
}

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
