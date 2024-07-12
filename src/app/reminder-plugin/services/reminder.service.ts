import { ComponentRef, Injectable } from '@angular/core';
import { EventService, IEvent, IResult } from '@c8y/client';
import { EventRealtimeService, RealtimeMessage } from '@c8y/ngx-components';
import { cloneDeep, filter as _filter, has, sortBy } from 'lodash';
import moment from 'moment';
import { BehaviorSubject, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ReminderDrawerComponent } from '../components/reminder-drawer/reminder-drawer.component';
import {
  Reminder,
  ReminderGroup,
  ReminderGroupStatus,
  ReminderStatus,
  REMINDER_INITIAL_QUERY_SIZE,
  REMINDER_TYPE,
} from '../reminder.model';
import { DomService } from './dom.service';

@Injectable()
export class ReminderService {
  reminders$ = new BehaviorSubject<Reminder[]>([]);
  reminderCounter$ = new BehaviorSubject<number>(0);
  open$?: BehaviorSubject<boolean>;

  private subscription = new Subscription();
  private drawerRef?: ComponentRef<unknown>;
  private drawer?: ReminderDrawerComponent;
  private updateTimer?: NodeJS.Timeout;
  private _reminderCounter = 0;
  private _reminders: Reminder[] = [];

  private get reminders(): Reminder[] {
    return this._reminders;
  }
  private set reminders(reminders: Reminder[]) {
    this._reminders = reminders;
    this.reminders$.next(this._reminders);
    this.updateCounter();
    this.setUpdateTimer();
  }

  private get reminderCounter(): number {
    return this._reminderCounter;
  }
  private set reminderCounter(count: number) {
    this._reminderCounter = count;
    this.reminderCounter$.next(this._reminderCounter);
  }

  constructor(
    private domService: DomService,
    private eventService: EventService,
    private eventRealtimeService: EventRealtimeService
  ) {}

  async init(): Promise<void> {
    if (this.drawer) return;

    void this.fetchActiveReminderCounter();
    this.createDrawer();
    this.reminders = await this.fetchReminders(REMINDER_INITIAL_QUERY_SIZE);
    this.setupReminderSubscription();
  }

  destroy() {
    if (this.drawerRef) this.domService.destroyComponent(this.drawerRef);
    this.subscription.unsubscribe();
  }

  toggleDrawer() {
    this.drawer?.toggle();
  }

  groupReminders(reminders: Reminder[]): ReminderGroup[] {
    let dueDate: number;
    const now = new Date().getTime();
    const cleared: ReminderGroup = {
      status: ReminderGroupStatus.cleared,
      count: 0,
      reminders: [],
    };
    const due: ReminderGroup = {
      status: ReminderGroupStatus.due,
      count: 0,
      reminders: [],
    };
    const upcoming: ReminderGroup = {
      status: ReminderGroupStatus.upcoming,
      count: 0,
      reminders: [],
    };

    // splitting into groups
    reminders.forEach((reminder) => {
      dueDate = new Date(reminder.time).getTime();

      if (reminder.status === ReminderStatus.cleared) {
        cleared.reminders.push(reminder);
        cleared.count++;
      } else if (dueDate <= now) {
        due.reminders.push(reminder);
        due.count++;
      } else {
        upcoming.reminders.push(reminder);
        upcoming.count++;
      }
    });

    // apply sort order

    due.reminders = sortBy(due.reminders, ['time']).reverse();
    upcoming.reminders = sortBy(upcoming.reminders, ['time']);
    cleared.reminders = sortBy(cleared.reminders, ['lastUpdated']).reverse();

    return [due, upcoming, cleared];
  }

  clear(): void {
    this.reminders = [];
  }

  async update(reminder: Reminder): Promise<IResult<Reminder>> {
    const event: Partial<IEvent> = {
      id: reminder.id,
      status: reminder.status,
    };

    if (reminder.status === ReminderStatus.cleared) event.isCleared = {};
    else event.isCleared = null;

    return (await this.eventService.update(event)) as IResult<Reminder>;
  }

  private createDrawer() {
    this.drawerRef = this.domService.appendComponentToBody(
      ReminderDrawerComponent
    );
    this.drawer = this.drawerRef.instance as ReminderDrawerComponent;
    this.open$ = this.drawer.open$;
  }

  // all reminders whos `time` is in the past and are still active
  private async fetchActiveReminderCounter(): Promise<number> {
    let counter = 0;

    try {
      const response = await this.eventService.list({
        type: REMINDER_TYPE,
        pageSize: 1,
        fragmentType: 'status',
        fragmentValue: ReminderStatus.active,
        withTotalPages: true,
        dateFrom: '1970-01-01',
        dateTo: moment().toISOString(),
      });

      counter = response?.paging?.totalPages || 0;
    } catch (error) {
      console.error(error); // TODO better error handling
    }

    this.reminderCounter = counter;

    return counter;
  }

  private async fetchReminders(
    pageSize: number,
    currentPage = 1
  ): Promise<Reminder[]> {
    let reminders: Reminder[] = [];

    try {
      const response = await this.eventService.list({
        type: REMINDER_TYPE,
        withTotalPages: currentPage === 1,
        pageSize,
        currentPage,
      });

      reminders = response.data as Reminder[];
    } catch (error) {
      console.error(error); // TODO better error handling
    }

    return this.digestReminders(reminders);
  }

  private setupReminderSubscription(): void {
    this.subscription.add(
      this.eventRealtimeService
        .onAll$()
        .pipe(
          filter(
            (message) =>
              message.realtimeAction === 'DELETE' ||
              (has(message.data, 'type') &&
                message.data['type'] === REMINDER_TYPE)
          ),
          map((message) => message as RealtimeMessage<Reminder>)
        )
        .subscribe((message) => this.handleReminderUpdate(message))
    );
  }

  private handleReminderUpdate(
    message: Partial<RealtimeMessage<Reminder>>
  ): Reminder | undefined {
    let reminders = cloneDeep(this.reminders);
    let now = moment();

    if (message.realtimeAction === 'DELETE')
      return this.deleteRminderFromList(message, reminders);

    const reminder = this.digestReminders([message.data as Reminder])[0];

    switch (message.realtimeAction) {
      case 'UPDATE':
        reminders = this._reminders.map((r) => {
          if (r.id === reminder.id) r = reminder;
          return r;
        });
        void this.fetchActiveReminderCounter();
        break;
      case 'CREATE':
        reminders = [...reminders, reminder];
        if (
          reminder.status === ReminderStatus.active &&
          moment(reminder.time) <= now
        )
          this.reminderCounter++;
        break;
    }

    // update order & diff
    this.reminders = this.digestReminders(reminders);

    return reminder;
  }

  private deleteRminderFromList(
    message: Partial<RealtimeMessage<Reminder>>,
    reminders: Reminder[]
  ): Reminder | undefined {
    let deleted: Reminder | undefined;

    reminders = reminders.filter((r) => {
      if (r.id === message.data) {
        deleted = r as Reminder;

        return false;
      } else {
        return true;
      }
    });

    if (deleted && deleted.status === ReminderStatus.active)
      this.reminderCounter--;

    this.reminders = this.digestReminders(reminders);

    return deleted;
  }

  private digestReminders(reminders: Reminder[]): Reminder[] {
    const now = moment();

    return reminders.map((reminder) => {
      reminder.diff = now.diff(reminder.time);

      return reminder;
    });
  }

  private updateCounter(): void {
    const now = new Date().getTime();
    let count = 0;
    let dueDate: number;

    this.reminders.forEach((reminder) => {
      dueDate = new Date(reminder.time).getTime();
      if (dueDate <= now && reminder.status === ReminderStatus.active) count++;
    });

    this.reminderCounter = count;
  }

  private setUpdateTimer(): void {
    const now = moment();

    clearTimeout(this.updateTimer);

    if (!this.reminders || !this.reminders.length) return;

    const dueReminders = _filter(
      this.reminders,
      (r) => r.status !== ReminderStatus.cleared && moment(r.time) > now
    );
    const closestReminder: Reminder = sortBy(dueReminders, 'time')[0];

    if (!closestReminder) return;

    this.updateTimer = setTimeout(
      () => (this.reminders = this.digestReminders(this.reminders)),
      moment(closestReminder.time).diff(now)
    );
  }
}
