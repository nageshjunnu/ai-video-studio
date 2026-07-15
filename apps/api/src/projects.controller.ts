import { Body, Controller, Get, Param, Post } from '@nestjs/common';
@Controller('projects') export class ProjectsController {
 @Get() list(){ return {data:[],meta:{total:0}} }
 @Get(':id') get(@Param('id') id:string){ return {id,status:'DRAFT'} }
 @Post() create(@Body() input:{title:string;format?:string}){ return {id:crypto.randomUUID(),status:'DRAFT',...input} }
 @Post(':id/render') render(@Param('id') id:string){ return {id:crypto.randomUUID(),projectId:id,status:'QUEUED',progress:0} }
}
