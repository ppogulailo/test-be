import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class JobValueInput {
  @ApiProperty()
  @IsString()
  dimension!: string;

  @ApiProperty({ type: [String], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  weight?: number;
}

export class SaveValuesDto {
  @ApiProperty({ type: [JobValueInput] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => JobValueInput)
  values!: JobValueInput[];
}
