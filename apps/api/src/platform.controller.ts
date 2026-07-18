import {BadRequestException,Body,Controller,Delete,Get,Param,Post,UseGuards} from '@nestjs/common';
import {CurrentUser,JwtGuard} from './auth';
import {PrismaService} from './prisma.service';
import {mkdir,rm} from 'node:fs/promises';
import {basename,join} from 'node:path';

type TemplateInput={name:string;description?:string;style?:string;videoUrl?:string;thumbnailUrl?:string};

@Controller('templates')
@UseGuards(JwtGuard)
export class TemplatesController{
 constructor(private db:PrismaService){}
 @Get()
 async list(@CurrentUser()user:any){const rows=await this.db.adminSetting.findMany({where:{key:{startsWith:'template:'}},orderBy:{updatedAt:'desc'}});return rows.map(row=>({id:row.key.slice(9),...(row.value as object)})).filter((template:any)=>user.role==='ADMIN'||template.createdBy===user.sub||(template.allowedUserIds??[]).includes(user.sub))}
 @Post()
 async create(@CurrentUser()user:any,@Body()body:TemplateInput){if(!body.name?.trim())throw new BadRequestException('Template name is required');const id=crypto.randomUUID();const value={name:body.name.trim(),description:body.description?.trim()??'',style:body.style??'heritage',videoUrl:body.videoUrl??'',thumbnailUrl:body.thumbnailUrl??'',createdBy:user.sub,creatorRole:user.role,allowedUserIds:[],createdAt:new Date().toISOString()};await this.db.adminSetting.create({data:{key:`template:${id}`,value,updatedBy:user.sub}});return{id,...value}}
 @Delete(':id')
 async remove(@CurrentUser()user:any,@Param('id')id:string){const row=await this.db.adminSetting.findUnique({where:{key:`template:${id}`}}),value=row?.value as any;if(!row)throw new BadRequestException('Template not found');if(user.role!=='ADMIN'&&value?.createdBy!==user.sub)throw new BadRequestException('Only the template owner can delete it');await this.db.adminSetting.delete({where:{key:`template:${id}`}});return{deleted:true}}
}

@Controller('creator-tools')
@UseGuards(JwtGuard)
export class CreatorToolsController{
 constructor(private db:PrismaService){}
 @Get('access')
 async access(@CurrentUser()user:any){const[account,global,userSetting]=await Promise.all([this.db.user.findUniqueOrThrow({where:{id:user.sub},select:{credits:true,role:true}}),this.db.adminSetting.findUnique({where:{key:'creator-tools:global'}}),this.db.adminSetting.findUnique({where:{key:`creator-tools:user:${user.sub}`}})]),config={masterEnabled:true,minimumCredits:100,videoTranscript:true,voiceTranscript:true,textToVoice:true,pixabayImages:true,pexelsImages:true,openverseImages:false,huggingFaceImages:false,geminiVisualPrompts:false,geminiTts:true,relatedVideoClips:false,...(global?.value as object)},permissions={videoTranscript:true,voiceTranscript:true,textToVoice:true,...(userSetting?.value as object)},creditEligible=account.role==='ADMIN'||account.credits>=Number(config.minimumCredits),enabled=config.masterEnabled!==false;return{credits:account.credits,minimumCredits:Number(config.minimumCredits),creditEligible,masterEnabled:enabled,permissions,thirdParty:{pixabayImages:config.pixabayImages!==false,pexelsImages:config.pexelsImages!==false,openverseImages:config.openverseImages!==false,huggingFaceImages:config.huggingFaceImages!==false,geminiVisualPrompts:config.geminiVisualPrompts!==false,geminiTts:config.geminiTts!==false,relatedVideoClips:config.relatedVideoClips!==false},available:{videoTranscript:enabled&&creditEligible&&config.videoTranscript&&permissions.videoTranscript,voiceTranscript:enabled&&creditEligible&&config.voiceTranscript&&permissions.voiceTranscript,textToVoice:enabled&&creditEligible&&config.textToVoice&&permissions.textToVoice}}}
}

@Controller('admin-insights')
@UseGuards(JwtGuard)
export class AdminInsightsController{
 constructor(private db:PrismaService){}
 private allow(user:any){if(user.role!=='ADMIN')throw new BadRequestException('Admin access required')}
 private publicDir(){return process.cwd().endsWith(join('apps','api'))?join(process.cwd(),'..','web','public'):join(process.cwd(),'apps','web','public')}
 private async removeFiles(urls:(string|null)[]){for(const url of urls){if(!url||!/^\/(?:renders|trash)\/[\w.-]+\.mp4$/i.test(url))continue;await rm(join(this.publicDir(),url.split('/')[1],basename(url)),{force:true}).catch(()=>{})}}
 @Get('analytics')
 async analytics(@CurrentUser()user:any){this.allow(user);const[roles,statuses,formats,languages,payments,totals,recent]=await Promise.all([
  this.db.user.groupBy({by:['role'],_count:true}),this.db.videoProject.groupBy({by:['status'],_count:true}),this.db.videoProject.groupBy({by:['format'],_count:true}),this.db.videoProject.groupBy({by:['language'],_count:true}),this.db.purchase.groupBy({by:['status'],_count:true,_sum:{amountInPaise:true,credits:true}}),
  Promise.all([this.db.user.count(),this.db.user.count({where:{role:'ADMIN'}}),this.db.videoProject.count(),this.db.videoProject.aggregate({_sum:{creditsConsumed:true}}),this.db.purchase.aggregate({where:{status:'SUCCEEDED'},_sum:{amountInPaise:true}})]),
  this.db.videoProject.findMany({take:8,orderBy:{createdAt:'desc'},select:{id:true,title:true,status:true,createdAt:true,user:{select:{fullName:true,role:true}}}})
 ]);return{roles,statuses,formats,languages,payments,totals:{users:totals[0],admins:totals[1],videos:totals[2],creditsConsumed:(totals[3] as any)._sum.creditsConsumed??0,revenuePaise:(totals[4] as any)._sum.amountInPaise??0},recent}}
 @Post('templates')
 async create(@CurrentUser()user:any,@Body()body:TemplateInput){this.allow(user);if(!body.name?.trim())throw new BadRequestException('Template name is required');const id=crypto.randomUUID();const value={name:body.name.trim(),description:body.description?.trim()??'',style:body.style??'heritage',videoUrl:body.videoUrl??'',thumbnailUrl:body.thumbnailUrl??'',createdBy:user.sub,creatorRole:user.role,allowedUserIds:[],createdAt:new Date().toISOString()};await this.db.adminSetting.create({data:{key:`template:${id}`,value,updatedBy:user.sub}});return{id,...value}}
 @Post('templates/:id/access')
 async templateAccess(@CurrentUser()user:any,@Param('id')id:string,@Body()body:{userIds:string[]}){this.allow(user);const row=await this.db.adminSetting.findUnique({where:{key:`template:${id}`}});if(!row)throw new BadRequestException('Template not found');const allowedUserIds=[...new Set((body.userIds??[]).filter(Boolean))];const value={...(row.value as object),allowedUserIds};await this.db.adminSetting.update({where:{key:`template:${id}`},data:{value,updatedBy:user.sub}});return{id,...value}}
 @Delete('templates/:id')
 async remove(@CurrentUser()user:any,@Param('id')id:string){this.allow(user);await this.db.adminSetting.delete({where:{key:`template:${id}`}});return{deleted:true}}
 @Post('videos/:id/target-users')
 async targetUsers(@CurrentUser()user:any,@Param('id')id:string,@Body()body:{userIds:string[]}){this.allow(user);const userIds=[...new Set((body.userIds??[]).filter(Boolean))];return this.db.videoProject.update({where:{id},data:{targetUserIds:userIds}})}
 @Delete('videos/:id')
 async deleteVideo(@CurrentUser()user:any,@Param('id')id:string){this.allow(user);const now=new Date();return this.db.videoProject.update({where:{id},data:{status:'ARCHIVED',visibility:'HIDDEN',archivedAt:now,deletedAt:now,purgeAfter:new Date(now.getTime()+60*24*60*60*1000)}})}
 @Post('videos/permanent-delete')
 async permanentDelete(@CurrentUser()user:any,@Body()body:{ids:string[]}){this.allow(user);const ids=[...new Set((body.ids??[]).filter(Boolean))];if(!ids.length)throw new BadRequestException('Select at least one video');const projects=await this.db.videoProject.findMany({where:{id:{in:ids}},select:{finalVideoUrl:true}});await this.db.videoProject.deleteMany({where:{id:{in:ids}}});await this.removeFiles(projects.map(project=>project.finalVideoUrl));return{deleted:projects.length}}
 @Post('videos/truncate')
 async truncateVideos(@CurrentUser()user:any){this.allow(user);const deleted=await this.db.videoProject.deleteMany();const publicDir=this.publicDir();for(const folder of ['renders','trash']){await rm(join(publicDir,folder),{recursive:true,force:true});await mkdir(join(publicDir,folder),{recursive:true})}return{deleted:deleted.count}}
 @Get('creator-tools')
 async creatorTools(@CurrentUser()user:any){this.allow(user);const[global,users,settings]=await Promise.all([this.db.adminSetting.findUnique({where:{key:'creator-tools:global'}}),this.db.user.findMany({select:{id:true,fullName:true,email:true,credits:true,role:true},orderBy:{createdAt:'desc'}}),this.db.adminSetting.findMany({where:{key:{startsWith:'creator-tools:user:'}}})]);const access=Object.fromEntries(settings.map(row=>[row.key.slice('creator-tools:user:'.length),row.value]));return{global:{masterEnabled:true,minimumCredits:100,videoTranscript:true,voiceTranscript:true,textToVoice:true,pixabayImages:true,pexelsImages:true,openverseImages:false,huggingFaceImages:false,geminiVisualPrompts:false,geminiTts:true,relatedVideoClips:false,...(global?.value as object)},users:users.map(entry=>({...entry,permissions:{videoTranscript:true,voiceTranscript:true,textToVoice:true,...(access[entry.id] as object)}}))}}
 @Post('creator-tools/global')
 async saveCreatorTools(@CurrentUser()user:any,@Body()body:any){this.allow(user);const value={masterEnabled:body.masterEnabled!==false,minimumCredits:Math.max(0,Number(body.minimumCredits??100)),videoTranscript:body.videoTranscript!==false,voiceTranscript:body.voiceTranscript!==false,textToVoice:body.textToVoice!==false,pixabayImages:body.pixabayImages!==false,pexelsImages:body.pexelsImages!==false,openverseImages:body.openverseImages!==false,huggingFaceImages:body.huggingFaceImages!==false,geminiVisualPrompts:body.geminiVisualPrompts!==false,geminiTts:body.geminiTts!==false,relatedVideoClips:body.relatedVideoClips!==false};await this.db.adminSetting.upsert({where:{key:'creator-tools:global'},update:{value,updatedBy:user.sub},create:{key:'creator-tools:global',value,updatedBy:user.sub}});return value}
 @Post('creator-tools/users/:id')
 async userCreatorTools(@CurrentUser()user:any,@Param('id')id:string,@Body()body:any){this.allow(user);const value={videoTranscript:body.videoTranscript!==false,voiceTranscript:body.voiceTranscript!==false,textToVoice:body.textToVoice!==false};await this.db.adminSetting.upsert({where:{key:`creator-tools:user:${id}`},update:{value,updatedBy:user.sub},create:{key:`creator-tools:user:${id}`,value,updatedBy:user.sub}});return value}
}
