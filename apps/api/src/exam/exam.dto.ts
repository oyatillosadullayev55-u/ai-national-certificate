import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TestMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/http';

export class AutoPickDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) topicIds?: string[];
  @ApiProperty({ minimum: 1, maximum: 200 }) @IsInt() @Min(1) @Max(200) count: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(5) difficultyMax?: number;
}

export class CreateTestDto {
  @ApiProperty() @IsString() @Length(1, 200) title: string;
  @ApiProperty({ enum: TestMode }) @IsEnum(TestMode) mode: TestMode;
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
  @ApiPropertyOptional({ description: 'Berilsa, savollar imtihon spetsifikatsiyasi bo\'limlari bo\'yicha tanlanadi' })
  @IsOptional() @IsUUID() examSpecId?: string;
  @ApiPropertyOptional({ description: 'Soniya; bo\'sh = cheklovsiz' }) @IsOptional() @IsInt() @Min(60) @Max(6 * 3600) durationSec?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() shuffle?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('4', { each: true }) questionVersionIds?: string[];
  @ApiPropertyOptional({ type: AutoPickDto }) @IsOptional() @ValidateNested() @Type(() => AutoPickDto) auto?: AutoPickDto;
}

export class PracticeDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsUUID('4', { each: true }) topicIds?: string[];
  @ApiPropertyOptional({ default: 10 }) @IsOptional() @IsInt() @Min(1) @Max(50) count?: number;
}

export class AssignTestDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() groupId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMinSize(1) @IsUUID('4', { each: true }) studentIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueAt?: string;
}

export class TestQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional({ enum: TestMode }) @IsOptional() @IsEnum(TestMode) mode?: TestMode;
  @ApiPropertyOptional() @IsOptional() @IsUUID() organizationId?: string;
}

export class SaveAnswerDto {
  @ApiProperty({
    description: 'Savol turiga qarab: {optionId} | {optionIds} | {value} | {text} | {pairs} | {order}',
    example: { optionId: '00000000-0000-0000-0000-000000000000' },
  })
  @IsDefined() response: Record<string, unknown> | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() flagged?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(6 * 3600 * 1000) timeSpentMs?: number;
  @ApiPropertyOptional({ description: 'Offline sinxronlashda eski javob yangisini bosib ketmasligi uchun' })
  @IsOptional() @IsDateString() clientUpdatedAt?: string;
}
