import { Body, Controller, Delete, Get, Module, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser, RequirePermissions } from '../common/decorators';
import { P } from '../common/permissions';
import { CreateQuestionDto, ImportQuestionsDto, QuestionQueryDto, QuestionVersionDto, ReviewDto } from './questions.dto';
import { QuestionsService } from './questions.service';

@ApiTags('questions')
@ApiBearerAuth()
@Controller('questions')
export class QuestionsController {
  constructor(private readonly q: QuestionsService) {}

  @RequirePermissions(P.questionsRead)
  @Get() list(@CurrentUser() u: AuthUser, @Query() query: QuestionQueryDto) { return this.q.list(u.id, query); }

  @RequirePermissions(P.questionsRead)
  @Get('search') search(@CurrentUser() u: AuthUser, @Query() query: QuestionQueryDto) { return this.q.list(u.id, query); }

  @RequirePermissions(P.questionsReview)
  @Get('review-queue') queue(@Query() query: QuestionQueryDto) { return this.q.reviewQueue(query); }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.q.get(u.id, id); }

  /** Ruxsat service ichida tekshiriladi (global yoki organizationId doirasida) */
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateQuestionDto) { return this.q.create(u.id, dto); }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: QuestionVersionDto) {
    return this.q.update(u.id, id, dto);
  }

  @Post(':id/submit-review')
  submit(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.q.submitForReview(u.id, id); }

  @RequirePermissions(P.questionsReview)
  @Post(':id/review')
  review(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.q.review(u.id, id, dto);
  }

  @RequirePermissions(P.questionsImport)
  @Post('import') import(@CurrentUser() u: AuthUser, @Body() dto: ImportQuestionsDto) { return this.q.import(u.id, dto.items); }

  @Delete(':id') remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.q.remove(u.id, id); }
}

@Module({ controllers: [QuestionsController], providers: [QuestionsService], exports: [QuestionsService] })
export class QuestionsModule {}
