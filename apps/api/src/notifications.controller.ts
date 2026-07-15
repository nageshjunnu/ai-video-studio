import {BadRequestException,Body,Controller,Delete,Get,Param,Patch,Post,UseGuards} from '@nestjs/common';
import {CurrentUser,JwtGuard} from './auth';
import {PrismaService} from './prisma.service';

@Controller('notifications')
@UseGuards(JwtGuard)
export class NotificationsController{
 constructor(private db:PrismaService){}
 @Get()
 async list(@CurrentUser()user:any){const account=await this.db.user.findUniqueOrThrow({where:{id:user.sub},select:{credits:true}}),setting=await this.db.adminSetting.findUnique({where:{key:'notification-defaults'}}),defaults=(setting?.value as any)??{lowCredits:true,lowCreditThreshold:200};if(defaults.lowCredits&&account.credits<=Number(defaults.lowCreditThreshold??200)){const exists=await this.db.notification.findFirst({where:{userId:user.sub,type:'LOW_CREDITS',dismissedAt:null,createdAt:{gte:new Date(Date.now()-7*86400000)}}});if(!exists)await this.db.notification.create({data:{userId:user.sub,title:'Credits are running low',body:`Your balance is ${account.credits} credits. Add credits to continue creating videos.`,type:'LOW_CREDITS',actionUrl:'/buy-credits'}})}return this.db.notification.findMany({where:{userId:user.sub,dismissedAt:null},orderBy:{createdAt:'desc'},take:50})}
 @Patch(':id/read') read(@CurrentUser()user:any,@Param('id')id:string){return this.db.notification.update({where:{id,userId:user.sub},data:{readAt:new Date()}})}
 @Delete(':id') dismiss(@CurrentUser()user:any,@Param('id')id:string){return this.db.notification.update({where:{id,userId:user.sub},data:{dismissedAt:new Date()}})}
}

@Controller('admin-notifications')
@UseGuards(JwtGuard)
export class AdminNotificationsController{
 constructor(private db:PrismaService){}
 private allow(user:any){if(user.role!=='ADMIN')throw new BadRequestException('Admin access required')}
 @Get('defaults')async defaults(@CurrentUser()user:any){this.allow(user);return(await this.db.adminSetting.findUnique({where:{key:'notification-defaults'}}))?.value??{lowCredits:true,lowCreditThreshold:200,offers:true,creditExpiry:false}}
 @Patch('defaults')async saveDefaults(@CurrentUser()user:any,@Body()body:any){this.allow(user);const value={lowCredits:body.lowCredits!==false,lowCreditThreshold:Math.max(0,Number(body.lowCreditThreshold??200)),offers:body.offers!==false,creditExpiry:body.creditExpiry===true};return this.db.adminSetting.upsert({where:{key:'notification-defaults'},update:{value,updatedBy:user.sub},create:{key:'notification-defaults',value,updatedBy:user.sub}})}
 @Post()async create(@CurrentUser()user:any,@Body()body:{title:string;body:string;type?:string;actionUrl?:string;audience?:'ALL'|'CUSTOMER'|'ADMIN'|'USER';userId?:string}){this.allow(user);if(!body.title?.trim()||!body.body?.trim())throw new BadRequestException('Title and message are required');const where=body.audience==='USER'?{id:body.userId}:body.audience&&body.audience!=='ALL'?{role:body.audience}:{};const users=await this.db.user.findMany({where:where as any,select:{id:true}});if(!users.length)throw new BadRequestException('No target users found');await this.db.notification.createMany({data:users.map(target=>({userId:target.id,title:body.title.trim(),body:body.body.trim(),type:body.type??'INFO',actionUrl:body.actionUrl||null}))});return{sent:users.length}}
}
