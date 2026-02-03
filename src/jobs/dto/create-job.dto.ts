import { IsArray, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { EmploymentType, ExperienceLevel, WorkArrangement } from '@prisma/client';

export class CreateJobDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsEnum(ExperienceLevel)
  experience!: ExperienceLevel;

  @IsEnum(EmploymentType)
  employmentType!: EmploymentType;

  @IsEnum(WorkArrangement)
  workArrangement!: WorkArrangement;

  @IsArray()
  @IsString({ each: true })
  responsibilities!: string[];

  @IsArray()
  @IsString({ each: true })
  requirements!: string[];

  @IsArray()
  @IsString({ each: true })
  niceToHave!: string[];

  @IsArray()
  @IsString({ each: true })
  perks!: string[];

  @IsArray()
  @IsString({ each: true })
  whoYouAre!: string[];

  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @IsOptional()
  @IsString()
  education?: string;

  @IsOptional()
  @IsString()
  location?: string;
}
