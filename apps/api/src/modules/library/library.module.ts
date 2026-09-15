import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AuthModule } from "../auth/auth.module";
import { LibraryController } from "./library.controller";
import { LibraryService } from "./library.service";
@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [LibraryController],
  providers: [LibraryService],
  exports: [],
})
export class LibraryModule {}
