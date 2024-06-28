import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  CoreModule,
  EventRealtimeService,
  hookAction,
} from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import {
  AssetFieldType,
  ReminderDrawerComponent,
  ReminderIndicatorComponent,
  ReminderModalComponent,
  TimeFieldType,
} from './components';
import { DomService, ReminderService } from './services';

@NgModule({
  declarations: [
    ReminderIndicatorComponent,
    ReminderDrawerComponent,
    ReminderModalComponent,
    AssetFieldType,
    TimeFieldType,
  ],
  imports: [
    CommonModule,
    CoreModule,
    RouterModule,
    AssetSelectorModule,
    MomentModule,
    FormlyModule.forChild({
      types: [
        { name: 'time', component: TimeFieldType },
        { name: 'asset', component: AssetFieldType },
      ],
    }),
    TooltipModule,
    CollapseModule,
  ],
  providers: [
    EventRealtimeService,
    ReminderService,
    DomService,
    hookAction({
      component: ReminderIndicatorComponent,
    }),
  ],
})
export class ReminderPluginModule {
  constructor(reminderService: ReminderService) {
    reminderService.init(); // TODO better way to init?
  }
}
