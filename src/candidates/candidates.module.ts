import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CandidatesController } from './candidates.controller';
import { CandidatesService } from './candidates.service';
import { CandidatesProfileController } from './candidates-profile.controller';
import { CandidatesProfileService } from './candidates-profile.service';

@Module({
  imports: [PrismaModule],
  controllers: [CandidatesProfileController, CandidatesController],
  providers: [CandidatesService, CandidatesProfileService],
})
export class CandidatesModule {}

