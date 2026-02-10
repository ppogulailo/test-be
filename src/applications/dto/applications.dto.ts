// applications.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ListApplicationsQueryDto {
  @ApiPropertyOptional({ type: Number, description: 'Filter by job id' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === '' ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  jobId?: number;
}
