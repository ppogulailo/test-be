import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { EmploymentType, ExperienceLevel, WorkArrangement } from '@prisma/client';

export class CreateJobDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiProperty({ enum: ExperienceLevel })
  @IsEnum(ExperienceLevel)
  experience!: ExperienceLevel;

  @ApiProperty({ enum: EmploymentType })
  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @ApiProperty({ enum: WorkArrangement })
  @IsEnum(WorkArrangement)
  workArrangement!: WorkArrangement;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  responsibilities!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  requirements!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  niceToHave!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  perks!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  whoYouAre!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  education?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;
}
