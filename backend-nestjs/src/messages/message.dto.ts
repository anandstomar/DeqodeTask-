import { IsOptional, IsString } from 'class-validator';

export class MessageDto {

  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  author: string;

  @IsString()
  content: string;
}
