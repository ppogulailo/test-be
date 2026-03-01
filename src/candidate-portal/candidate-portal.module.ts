import { Module } from '@nestjs/common';
import { CandidatePortalController } from './candidate-portal.controller';
import { CandidatePortalService } from './candidate-portal.service';

@Module({
  controllers: [CandidatePortalController],
  providers: [CandidatePortalService],
})
export class CandidatePortalModule {}
