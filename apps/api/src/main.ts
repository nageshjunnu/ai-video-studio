import {NestFactory} from '@nestjs/core';
import {AppModule} from './app.module';
import {ValidationPipe} from '@nestjs/common';

async function bootstrap(){
 const app=await NestFactory.create(AppModule);
 const configured=(process.env.WEB_URL??'http://localhost:3000').split(',').map(value=>value.trim().replace(/\/$/,''));
 app.enableCors({
  credentials:true,
  origin(origin:string|undefined,callback:(error:Error|null,allow?:boolean)=>void){
   if(!origin||configured.includes(origin.replace(/\/$/,'')))return callback(null,true);
   if(process.env.NODE_ENV!=='production'&&/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))return callback(null,true);
   callback(new Error(`CORS origin not allowed: ${origin}`),false);
  },
 });
 app.useGlobalPipes(new ValidationPipe({whitelist:true,transform:true}));
 app.setGlobalPrefix('api/v1');
 await app.listen(process.env.API_PORT??4000);
}
bootstrap();
