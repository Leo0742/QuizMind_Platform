import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@quizmind/database';
import { PrismaService } from '../database/prisma.service';

type Db = PrismaService | Prisma.TransactionClient;
const select = { id:true, ownerUserId:true, sourceScenarioId:true, slug:true, name:true, description:true, buttonLabel:true, icon:true, schemaVersion:true, presetVersion:true, visibility:true, category:true, tags:true, publishedAt:true, featuredAt:true, moderationStatus:true, sourceLanguage:true, targetLanguage:true, configJson:true, installCount:true, createdAt:true, updatedAt:true, disabledAt:true } satisfies Prisma.ExtensionScenarioPresetSelect;
@Injectable()
export class ExtensionScenarioPresetsRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}
  private m(db?:Db){ return (db??this.prisma).extensionScenarioPreset; }
  create(data: Prisma.ExtensionScenarioPresetCreateInput, db?:Db){ return this.m(db).create({data,select}); }
  findBySlug(slug:string, db?:Db){ return this.m(db).findUnique({where:{slug},select}); }
  listMine(ownerUserId:string){ return this.m().findMany({where:{ownerUserId},orderBy:{createdAt:'desc'},select}); }
  listCatalog(where: Prisma.ExtensionScenarioPresetWhereInput, orderBy: Prisma.ExtensionScenarioPresetOrderByWithRelationInput[], skip: number, take: number){ return this.m().findMany({where,orderBy,skip,take,select}); }
  updateBySlug(slug:string, data: Prisma.ExtensionScenarioPresetUpdateInput, db?:Db){ return this.m(db).update({where:{slug},data,select}); }
  transaction<T>(fn:(tx:Prisma.TransactionClient)=>Promise<T>){ return this.prisma.$transaction((tx)=>fn(tx)); }
}
