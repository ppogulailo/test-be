import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsInt,
  IsDateString,
} from 'class-validator';
import {
  EmploymentType,
  ExperienceLevel,
  WorkArrangement,
  CompanySize,
  RequirementsLevel,
} from '@prisma/client';
import { Type, Transform } from 'class-transformer';
import { JobLanguageEnum } from './create-job.dto';

function toEnumUppercase() {
  return Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  );
}

export class UpdateJobDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ enum: ExperienceLevel })
  @IsOptional()
  @toEnumUppercase()
  @IsEnum(ExperienceLevel)
  experience?: ExperienceLevel;

  @ApiPropertyOptional({ enum: EmploymentType })
  @IsOptional()
  @toEnumUppercase()
  @IsEnum(EmploymentType)
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ enum: WorkArrangement })
  @IsOptional()
  @toEnumUppercase()
  @IsEnum(WorkArrangement)
  workArrangement?: WorkArrangement;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibilities?: string;

  @ApiPropertyOptional({ enum: RequirementsLevel })
  @IsOptional()
  @toEnumUppercase()
  @IsEnum(RequirementsLevel)
  requirements?: RequirementsLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  perks?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  education?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: JobLanguageEnum })
  @IsOptional()
  @IsEnum(JobLanguageEnum)
  language?: JobLanguageEnum;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  introduction?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  hoursPerWeek?: number;

  @ApiPropertyOptional({
    enum: CompanySize,
    description: 'Size of the company: SIZE_1_10 (1-10), SIZE_11_50 (11-50), SIZE_51_200 (51-200), SIZE_201_500 (201-500), SIZE_500_PLUS (500+)',
  })
  @IsOptional()
  @toEnumUppercase()
  @IsEnum(CompanySize)
  companySize?: CompanySize;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  videoUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  applicationClosingDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jobNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  recruiterId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  assignedRecruiterId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  departmentId?: number;
}


