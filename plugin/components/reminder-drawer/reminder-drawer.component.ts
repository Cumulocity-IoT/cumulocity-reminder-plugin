import { Component, OnDestroy } from '@angular/core';
import { AlertService, HeaderService } from '@c8y/ngx-components';
import { filter, sortBy } from 'lodash';
import moment from 'moment';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BehaviorSubject, Subscription } from 'rxjs';
import {
  Reminder,
  ReminderGroup,
  ReminderGroupStatus,
  ReminderStatus,
  REMINDER_DRAWER_OPEN_CLASS,
  REMINDER_MAIN_HEADER_CLASS
} from '../../reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderModalComponent } from '../reminder-modal/reminder-modal.component';

@Component({
  selector: 'c8y-reminder-drawer',
  templateUrl: './reminder-drawer.component.html',
  styleUrls: ['./reminder-drawer.component.less']
})
export class ReminderDrawerComponent implements OnDestroy {
  open$ = new BehaviorSubject<boolean>(this.open);
  lastUpdate: Date;
  reminders: Reminder[] = [];
  reminderGroups: ReminderGroup[] = [];

  // for template
  reminderStatus = ReminderStatus;
  reminderGroupStatus = ReminderGroupStatus;

  get open(): boolean {
    return this._open;
  }

  set open(openStatus: boolean) {
    this._open = openStatus;
    this.open$.next(openStatus);
  }

  private subscriptions = new Subscription();
  private updateTimer: NodeJS.Timeout;
  private rightDrawerOpen = false;
  private _open = false;

  constructor(
    private headerService: HeaderService,
    private reminderService: ReminderService,
    private alertService: AlertService,
    private modalService: BsModalService
  ) {
    // check if the actual drawer was opened
    this.subscriptions.add(
      this.headerService.rightDrawerOpen$.subscribe((open) => {
        this.rightDrawerOpen = open;

        if (open && this.open) {
          // close the reminders, if the user menu opened
          this.open = false;
        }
      })
    );

    this.subscriptions.add(this.reminderService.reminders$.subscribe((reminders) => this.digestReminders(reminders)));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.updateTimer);
  }

  toggle(open?: boolean): boolean {
    open = typeof open === 'boolean' ? open : !this.open;

    this.open = open;
    this.toggleRightDrawer(open);

    return this.open;
  }

  createReminder(): void {
    this.modalService.show(ReminderModalComponent, {
      class: 'modal-sm'
    });
  }

  async updateReminder(reminder: Reminder, status: Reminder['status']): Promise<void> {
    reminder.status = status;

    const { res } = await this.reminderService.update(reminder);

    if (res.status === 200) {
      this.alertService.success(`Reminder ${String(status).toLowerCase()}`);
    } else {
      this.alertService.danger('Could not update reminder', res.statusText);
    }
  }

  private toggleRightDrawer(open: boolean): void {
    const drawer = document.getElementsByClassName(REMINDER_MAIN_HEADER_CLASS)[0];

    if (open) drawer.classList.add(REMINDER_DRAWER_OPEN_CLASS);
    else drawer.classList.remove(REMINDER_DRAWER_OPEN_CLASS);

    if (this.rightDrawerOpen) {
      // set user menu drawer status closed, if it is still open
      this.headerService.closeRightDrawer();
      setTimeout(() => {
        // minimal delay needed to override closing animation and keep drawer open
        if (open) drawer.classList.add(REMINDER_DRAWER_OPEN_CLASS);
      }, 1);
    }
  }

  private digestReminders(reminders: Reminder[]): void {
    // TODO allow filtering in UI?
    // - filter by type, group / device?
    this.reminders = reminders;
    this.reminderGroups = this.reminderService.groupReminders(reminders);
    this.lastUpdate = new Date();
    this.setUpdateTimer();
  }

  private setUpdateTimer(): void {
    // TODO update indicator
    // - move update timer to service?
    const now = moment();

    clearTimeout(this.updateTimer);

    if (!this.reminders.length) {
      return;
    }

    const closestReminder = sortBy(
      filter(this.reminders, (r) => r.status !== ReminderStatus.cleared && moment(r.time) > now),
      'time'
    )[0];

    this.updateTimer = setTimeout(() => this.digestReminders(this.reminders), moment(closestReminder.time).diff(now));
  }
}
