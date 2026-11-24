import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CopyrightStatus, ContentStatus, QuestionType, ReviewDecision } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsObject, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../common/http';

export class OptionDto {
  @ApiProperty({ example: 'A' }) @IsString() @Length(1, 4) label: string;
  @ApiProperty() @IsString() @Length(1, 2000) content: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isCorrect?: boolean;
}

export class QuestionVersionDto {
  @ApiProperty({ description: 'Savol matni (Markdown + LaTeX)' }) @IsString() @Length(1, 10000) stem: string;
  @ApiPropertyOptional({ description: 'MATCHING: {left,right}; ORDERING: {items}; CONTEXT_BASED: {context}' })
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'NUMERIC: {value,tolerance}; TEXT: {accepted[]}; MATCHING: {pairs}; ORDERING: {order}; TRUE_FALSE: {value}' })
  @IsOptional() @IsObject() answerKey?: Record<string, unknown>;
  @ApiPropertyOptional({ type: [OptionDto] })
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => OptionDto) options?: OptionDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20000) solution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10000) explanation?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 5 }) @IsOptional() @IsInt() @Min(1) @Max(5) difficulty?: number;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsNumber() @Min(0) @Max(100) points?: number;
}

export class CreateQuestionDto extends QuestionVersionDto {
  @ApiProperty() @IsUUID() subjectId: string;
  @ApiProperty() @IsUUID() topicId: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() objectiveId?: string;
  @ApiPropertyOptional({ description: 'Repetitor/markazning xususiy savoli uchun' }) @IsOptional() @IsUUID() organizationId?: string;
  @ApiProperty({ enum: QuestionType }) @IsEnum(QuestionType) type: QuestionType;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) source?: string;
  @ApiPropertyOptional({ enum: CopyrightStatus }) @IsOptional() @IsEnum(CopyrightStatus) copyrightStatus?: CopyrightStatus;
}

export class ReviewDto {
  @ApiProperty() @IsUUID() versionId: string;
  @ApiProperty({ enum: ReviewDecision }) @IsEnum(ReviewDecision) decision: ReviewDecision;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

export class ImportQuestionsDto {
  @ApiProperty({ type: [CreateQuestionDto] })
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => CreateQuestionDto)
  items: CreateQuestionDto[];
}

export class QuestionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() subjectId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() topicId?: string;
  @ApiPropertyOptional({ enum: ContentStatus }) @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @ApiPropertyOptional({ enum: QuestionType }) @IsOptional() @IsEnum(QuestionType) type?: QuestionType;
  @ApiPropertyOptional({ description: 'Savol matni bo\'yicha qidiruv' }) @IsOptional() @IsString() @MaxLength(200) q?: string;
}
