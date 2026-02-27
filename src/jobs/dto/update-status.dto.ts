import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';
import { JobStatus } from '@prisma/client';

export class UpdateStatusDto {
  @ApiProperty({ enum: JobStatus })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsEnum(JobStatus)
  status!: JobStatus;
}
