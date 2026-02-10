import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

export class MoveApplicationStageDto {
  @Type(() => Number)
  @IsInt()
  stageId!: number;
}

