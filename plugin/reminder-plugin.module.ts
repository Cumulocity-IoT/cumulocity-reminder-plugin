import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CoreModule, EventRealtimeService, hookAction } from '@c8y/ngx-components';
import { FormlyModule } from '@ngx-formly/core';
import { MomentModule } from 'ngx-moment';
import { ReminderDrawerComponent } from './components/reminder-drawer/reminder-drawer.component';
import { ReminderIndicatorComponent } from './components/reminder-indicator/reminder-indicator.component';
import { ReminderModalComponent } from './components/reminder-modal/reminder-modal.component';
import { TimeFieldType } from './components/time.formly/time.formly.component';
import { DomService } from './services/dom.service';
import { ReminderService } from './services/reminder.service';

/*
// TODOs
- [ ] CRU(ack/clear)D permissions for reminder
- [ ] check drawer setup
- [ ] reactivate a reminder
- [ ] list of all reminders
- [ ] asset selection
- [ ] audio feedback for new reminder
- [ ] highlight newly added reminders
*/

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule,
    MomentModule,
    FormlyModule.forChild({
      types: [{ name: 'time', component: TimeFieldType }]
    })
  ],
  declarations: [ReminderDrawerComponent, ReminderIndicatorComponent, ReminderModalComponent, TimeFieldType],
  providers: [
    ReminderService,
    EventRealtimeService,
    DomService,
    // hookDrawer({
    //   position: 'right',
    //   component: ReminderDrawerComponent,
    //   priority: 1000,
    //   id: 'reminder',
    // }),
    hookAction({
      component: ReminderIndicatorComponent,
      priority: 0
    })
  ]
})
export class ReminderPluginModule {
  constructor(reminderService: ReminderService) {
    reminderService.init(); // TODO better way to init?
  }
}
