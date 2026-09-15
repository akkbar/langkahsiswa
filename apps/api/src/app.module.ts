import { Module } from "@nestjs/common";
import { AcademicYearSetupModule } from "./modules/academic-year-setup/academic-year-setup.module";
import { AdmissionsModule } from "./modules/admissions/admissions.module";
import { AssessmentPlansModule } from "./modules/assessment-plans/assessment-plans.module";
import { AttendanceModule } from "./modules/attendance/attendance.module";
import { AuthModule } from "./modules/auth/auth.module";
import { BoardingModule } from "./modules/boarding/boarding.module";
import { CbtModule } from "./modules/cbt/cbt.module";
import { DomainsModule } from "./modules/domains/domains.module";
import { FamilyModule } from "./modules/family/family.module";
import { FinanceModule } from "./modules/finance/finance.module";
import { FoundationModule } from "./modules/foundation/foundation.module";
import { GradebookModule } from "./modules/gradebook/gradebook.module";
import { HealthModule } from "./modules/health/health.module";
import { LessonPlanningModule } from "./modules/lesson-planning/lesson-planning.module";
import { LibraryModule } from "./modules/library/library.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { PersonnelModule } from "./modules/personnel/personnel.module";
import { PortalModule } from "./modules/portal/portal.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { ResourcesModule } from "./modules/resources/resources.module";
import { RoleSettingsModule } from "./modules/role-settings/role-settings.module";
import { SecurityModule } from "./modules/security/security.module";
import { SitesModule } from "./modules/sites/sites.module";
import { WebsiteModule } from "./modules/website/website.module";
@Module({
  imports: [
    HealthModule,
    CbtModule,
    AdmissionsModule,
    WebsiteModule,
    FamilyModule,
    AuthModule,
    RoleSettingsModule,
    PersonnelModule,
    LessonPlanningModule,
    AttendanceModule,
    GradebookModule,
    AssessmentPlansModule,
    ReportsModule,
    NotificationsModule,
    PortalModule,
    FinanceModule,
    DomainsModule,
    BoardingModule,
    LibraryModule,
    SecurityModule,
    SitesModule,
    FoundationModule,
    AcademicYearSetupModule,
    // Generic :resource routes must follow all concrete feature routes.
    ResourcesModule,
  ],
})
export class AppModule {}
