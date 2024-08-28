import { Component, OnDestroy } from '@angular/core';
import { AlertService, HeaderService } from '@c8y/ngx-components';
import { has } from 'lodash';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BehaviorSubject, Subscription } from 'rxjs';
import {
  Reminder,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupFilter,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
  REMINDER_DRAWER_OPEN_CLASS,
  REMINDER_MAIN_HEADER_CLASS,
  REMINDER_TYPE_FRAGMENT,
} from '../../reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderModalComponent } from '../reminder-modal/reminder-modal.component';

@Component({
  selector: 'c8y-reminder-drawer',
  templateUrl: './reminder-drawer.component.html',
  styleUrl: './reminder-drawer.component.less',
})
export class ReminderDrawerComponent implements OnDestroy {
  open$ = new BehaviorSubject<boolean>(this.open);
  config: ReminderConfig;
  reminders: Reminder[] = [];
  reminderGroups: ReminderGroup[] = [];
  lastUpdate?: Date;
  types: ReminderType[] = [];

  // for template
  reminderStatus = ReminderStatus;
  reminderGroupStatus = ReminderGroupStatus;
  groupIsExpanded: boolean[] = [true, true, false];
  typeFilter = '';

  get open(): boolean {
    return this._open;
  }

  set open(openStatus: boolean) {
    this._open = openStatus;
    this.open$.next(openStatus);
  }

  private subscriptions = new Subscription();
  private rightDrawerOpen = false;
  private updateTimer?: NodeJS.Timeout;
  private _open = false;

  constructor(
    private alertService: AlertService,
    private headerService: HeaderService,
    private modalService: BsModalService,
    private reminderService: ReminderService
  ) {
    this.initFilter();
    this.initSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.updateTimer);
  }

  createReminder(): void {
    this.modalService.show(ReminderModalComponent, {
      class: 'modal-sm',
    });
  }

  filterReminders(): void {
    this.reminderGroups = this.reminderService.groupReminders(
      this.reminders,
      this.buildFilter()
    );
    this.reminderService.storeFilterConfig();
  }

  setConfig(configOption: string, status: boolean) {
    this.reminderService.setConfig(configOption, status);
  }

  setTypeFilter(type: ReminderType['id']): void {
    if (!this.types.length) return;

    this.typeFilter = type;
    this.filterReminders();
  }

  toggle(open?: boolean): boolean {
    open = typeof open === 'boolean' ? open : !this.open;

    this.open = open;
    this.toggleRightDrawer(open);

    return this.open;
  }

  private buildFilter(): ReminderGroupFilter {
    const filters: ReminderGroupFilter = {};

    // populate filters
    if (this.typeFilter !== '')
      filters[REMINDER_TYPE_FRAGMENT] = this.typeFilter;

    return Object.keys(filters).length > 0 ? filters : null;
  }

  private digestReminders(reminders: Reminder[]): void {
    this.reminders = reminders;
    this.lastUpdate = new Date();
    this.reminderGroups = this.reminderService.groupReminders(
      reminders,
      this.buildFilter()
    );
  }

  private initFilter(): void {
    this.types = this.reminderService.types;

    if (!this.types.length) {
      this.reminderService.resetFilterConfig();
      return;
    }

    const filters = this.reminderService.filters;

    if (has(filters, REMINDER_TYPE_FRAGMENT))
      this.typeFilter = filters[REMINDER_TYPE_FRAGMENT];
  }

  private initSubscriptions(): void {
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

    // get live updates on reminders from service
    this.subscriptions.add(
      this.reminderService.reminders$.subscribe((reminders) =>
        this.digestReminders(reminders)
      )
    );

    // get config updates
    this.subscriptions.add(
      this.reminderService.config$.subscribe((config) => {
        this.config = config;
      })
    );
  }

  private toggleRightDrawer(open: boolean): void {
    const drawer = document.getElementsByClassName(
      REMINDER_MAIN_HEADER_CLASS
    )[0];

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

  async updateReminder(
    reminder: Reminder,
    status: Reminder['status']
  ): Promise<void> {
    reminder.status = status;

    const { res } = await this.reminderService.update(reminder);

    if (res.status === 200) {
      this.alertService.success(`Reminder ${String(status).toLowerCase()}`);
    } else {
      this.alertService.danger('Could not update reminder', res.statusText);
    }
  }
}
