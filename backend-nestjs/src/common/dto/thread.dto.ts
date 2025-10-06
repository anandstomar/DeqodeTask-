import { IsOptional, IsString } from 'class-validator';

export class ThreadDto {
  @IsString()
  user_id: string;

  @IsString()
  thread_id: string;

  @IsOptional()
  @IsString()
  question: string;
}
