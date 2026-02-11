import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class CoreValueInput {
  @ApiProperty()
  @IsString()
  value!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;
}

export class SaveBenchmarkDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobPostRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  benchmarkRole?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hiringFocus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  developmentStrategy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  longTermAlignment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  candidateFitPriority?: string;

  @ApiPropertyOptional({ type: [CoreValueInput] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CoreValueInput)
  coreValues?: CoreValueInput[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  teamStyleTags?: string[];
}
