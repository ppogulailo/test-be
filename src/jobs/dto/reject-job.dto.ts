import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RejectJobDto {
  @ApiProperty({ description: 'Reason for rejecting the job' })
  @IsString()
  @MinLength(1, { message: 'rejectionReason must not be empty' })
  rejectionReason!: string;
}
