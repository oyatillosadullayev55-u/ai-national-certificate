import { Body, Controller, Get, HttpCode, Module, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser, CurrentUser } from '../common/decorators';
import { AssignTestDto, CreateTestDto, PracticeDto, SaveAnswerDto, TestQueryDto } from './exam.dto';
import { ExamEngineService } from './exam-engine.service';
import { TestsService } from './tests.service';

@ApiTags('tests')
@ApiBearerAuth()
@Controller('tests')
export class TestsController {
  constructor(private readonly tests: TestsService, private readonly engine: ExamEngineService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query() q: TestQueryDto) { return this.tests.list(u.id, q); }

  @Get('assigned') assigned(@CurrentUser() u: AuthUser) { return this.tests.myAssignments(u.id); }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateTestDto) { return this.tests.create(u.id, dto); }

  @ApiOperation({ summary: 'O\'quvchi uchun tezkor mashq testi yaratadi va darhol boshlaydi' })
  @Post('practice')
  async practice(@CurrentUser() u: AuthUser, @Body() dto: PracticeDto) {
    const t = await this.tests.createPractice(u.id, dto);
    return this.engine.start(u.id, t.id);
  }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.tests.get(u.id, id); }

  @Post(':id/publish') @HttpCode(200)
  publish(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.tests.publish(u.id, id); }

  @ApiOperation({ summary: 'Testni boshlaydi yoki tugallanmagan urinishni davom ettiradi' })
  @Post(':id/start') @HttpCode(200)
  start(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.engine.start(u.id, id); }

  @Post(':id/assign')
  assign(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignTestDto) {
    return this.tests.assign(u.id, id, dto);
  }
}

/** Yagona attempt lifecycle: start (tests) → answers → submit → result */
@ApiTags('attempts')
@ApiBearerAuth()
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly engine: ExamEngineService) {}

  @Get('me') mine(@CurrentUser() u: AuthUser) { return this.engine.myAttempts(u.id); }

  @ApiOperation({ summary: 'Urinish holati, savollar (javob kalitlarisiz), saqlangan javoblar, server vaqti' })
  @Get(':attemptId') view(@CurrentUser() u: AuthUser, @Param('attemptId', ParseUUIDPipe) id: string) { return this.engine.view(u.id, id); }

  @ApiOperation({ summary: 'Javobni saqlash — idempotent (qayta yuborilsa takror yaratilmaydi)' })
  @Put(':attemptId/answers/:questionVersionId')
  save(
    @CurrentUser() u: AuthUser,
    @Param('attemptId', ParseUUIDPipe) attemptId: string,
    @Param('questionVersionId', ParseUUIDPipe) qvId: string,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.engine.saveAnswer(u.id, attemptId, qvId, dto);
  }

  @ApiOperation({ summary: 'Yakunlash — idempotent' })
  @Post(':attemptId/submit') @HttpCode(200)
  submit(@CurrentUser() u: AuthUser, @Param('attemptId', ParseUUIDPipe) id: string) { return this.engine.submit(u.id, id); }

  @Get(':attemptId/result') result(@CurrentUser() u: AuthUser, @Param('attemptId', ParseUUIDPipe) id: string) { return this.engine.result(u.id, id); }
}

@Module({
  controllers: [TestsController, AttemptsController],
  providers: [TestsService, ExamEngineService],
  exports: [ExamEngineService, TestsService],
})
export class ExamModule {}
