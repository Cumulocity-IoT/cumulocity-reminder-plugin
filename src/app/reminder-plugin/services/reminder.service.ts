import { ComponentRef, Injectable } from '@angular/core';
import {
  EventService,
  IEvent,
  IResult,
  TenantOptionsService,
} from '@c8y/client';
import {
  AlertService,
  EventRealtimeService,
  RealtimeMessage,
} from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { cloneDeep, filter as _filter, has, orderBy, sortBy } from 'lodash';
import moment from 'moment';
import { BehaviorSubject, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ReminderDrawerComponent } from '../components/reminder-drawer/reminder-drawer.component';
import {
  Reminder,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupFilter,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
  REMINDER_INITIAL_QUERY_SIZE,
  REMINDER_LOCAL_STORAGE_CONFIG,
  REMINDER_LOCAL_STORAGE_FILTER,
  REMINDER_TENENAT_OPTION_CATEGORY,
  REMINDER_TENENAT_OPTION_TYPE_KEY,
  REMINDER_TYPE,
} from '../reminder.model';
import { ActiveTabService } from './active-tab.service';
import { DomService } from './dom.service';
import { LocalStorageService } from './local-storage.service';

@Injectable()
export class ReminderService {
  config$ = new BehaviorSubject<ReminderConfig>({});
  open$?: BehaviorSubject<boolean>;
  reminders$ = new BehaviorSubject<Reminder[]>([]);
  reminderCounter$ = new BehaviorSubject<number>(0);

  get filters(): ReminderGroupFilter {
    return this._filters;
  }

  get types(): ReminderType[] {
    return this._types;
  }

  private hasNotificationPermission = false;
  private subscriptions = new Subscription();
  private drawer?: ReminderDrawerComponent;
  private drawerRef?: ComponentRef<unknown>;
  private updateTimer?: NodeJS.Timeout;

  private _filters: ReminderGroupFilter;
  private _reminderCounter = 0;
  private _reminders: Reminder[] = [];
  private _types: ReminderType[] = [];
  private _config: ReminderConfig;

  private get reminderCounter(): number {
    return this._reminderCounter;
  }
  private set reminderCounter(count: number) {
    this._reminderCounter = count;
    this.reminderCounter$.next(this._reminderCounter);
  }

  private get reminders(): Reminder[] {
    return this._reminders;
  }
  private set reminders(reminders: Reminder[]) {
    this._reminders = reminders;
    this.reminders$.next(this._reminders);
    this.updateCounter();
    this.setUpdateTimer();
  }

  constructor(
    private activeTabService: ActiveTabService,
    private alertService: AlertService,
    private domService: DomService,
    private eventService: EventService,
    private eventRealtimeService: EventRealtimeService,
    private localStorageService: LocalStorageService,
    private tenantOptionService: TenantOptionsService,
    private translateService: TranslateService
  ) {
    this.activeTabService.init();
  }

  clear(): void {
    this.reminders = [];
  }

  destroy() {
    if (this.drawerRef) this.domService.destroyComponent(this.drawerRef);
    this.subscriptions.unsubscribe();
  }

  async init(): Promise<void> {
    if (this.drawer) return;

    this.loadConfig();
    this.loadFilterConfig(); // TODO join with config
    this.requestNotificationPermission();
    this._types = await this.fetchReminderTypes();
    void this.fetchActiveReminderCounter();
    this.createDrawer();
    this.reminders = await this.fetchReminders(REMINDER_INITIAL_QUERY_SIZE);
    this.setupReminderSubscription();
    this.setupConfigSubscription();
  }

  getReminderTypeName(
    reminderTypeID: ReminderType['id']
  ): ReminderType['name'] {
    const type = this.types.find((t) => t.id === reminderTypeID);

    return type ? type.name : 'Unknown';
  }

  groupReminders(
    reminders: Reminder[],
    filters = this._filters
  ): ReminderGroup[] {
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

    this._filters = filters;

    return this.applyFilters([due, upcoming, cleared], filters);
  }

  resetFilterConfig(): void {
    this.localStorageService.delete(REMINDER_LOCAL_STORAGE_FILTER);
  }

  setConfig(key: string, value: any): void {
    this._config[key] = value;
    this.localStorageService.set(REMINDER_LOCAL_STORAGE_CONFIG, this._config);
  }

  storeFilterConfig(): void {
    if (!this.filters) this.resetFilterConfig();

    this.localStorageService.set(REMINDER_LOCAL_STORAGE_FILTER, this.filters);
  }

  toggleDrawer() {
    this.drawer?.toggle();
  }

  private applyFilters(
    groups: ReminderGroup[],
    filters?: ReminderGroupFilter
  ): ReminderGroup[] {
    if (!filters) return groups;

    const keys = Object.keys(filters);
    if (!keys.length) return groups;

    groups.map((group) => {
      group.reminders = group.reminders.filter((reminder) =>
        this.applyReminderFilter(reminder, filters)
      );
      group.total = group.count;
      group.count = group.reminders.length;
      return group;
    });

    return groups;
  }

  private applyReminderFilter(
    reminder: Reminder,
    filters: ReminderGroupFilter
  ): Reminder {
    const keys = Object.keys(filters);
    if (!keys.length) return reminder;

    let check = true;
    keys.forEach((key) => {
      if (reminder[key] !== filters[key]) check = false;
    });

    if (!check) return;
    return reminder;
  }

  private createDrawer() {
    this.drawerRef = this.domService.appendComponentToBody(
      ReminderDrawerComponent
    );
    this.drawer = this.drawerRef.instance as ReminderDrawerComponent;
    this.open$ = this.drawer.open$;
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

  private async fetchReminderTypes(): Promise<ReminderType[]> {
    let types: ReminderType[] = [];

    try {
      const response = await this.tenantOptionService.detail({
        category: REMINDER_TENENAT_OPTION_CATEGORY,
        key: REMINDER_TENENAT_OPTION_TYPE_KEY,
      });

      if (response.data)
        types = (JSON.parse(response.data.value) as ReminderType[]).map(
          (type) => ({
            id: type.id,
            name: this.translateService.instant(type.name),
          })
        );
    } catch (error) {
      console.log('[R.S:1] No reminder type config found.', error);
    }

    return orderBy(types, 'name');
  }

  private getAssetUrlFromReminder(
    reminder: Reminder,
    absoluteUrl = false
  ): string {
    let url = '';

    if (absoluteUrl) {
      url = `${location.origin}${location.pathname}${location.search}#`;
    }

    const assetType = reminder.isGroup ? 'group' : 'device';
    url += `/${assetType}/${reminder.source.id}`;

    return url;
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

  private loadFilterConfig(): void {
    const stored = this.localStorageService.get<ReminderGroupFilter>(
      REMINDER_LOCAL_STORAGE_FILTER
    );

    if (stored) this._filters = stored;
  }

  private loadConfig(): void {
    this._config = this.localStorageService.getOrDefault<ReminderConfig>(
      REMINDER_LOCAL_STORAGE_CONFIG,
      { toast: false, browser: false }
    );
    this.config$.next(this._config);
  }

  private async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('This browser does not support notifications.');
      return false;
    }

    const response = await Notification.requestPermission();

    return (this.hasNotificationPermission = response === 'granted');
  }

  private sendNotification(reminder: Reminder): void {
    if (!this.activeTabService.isActive()) return;
    if (this._config.browser) this.sendBrowserNotification(reminder);
    if (this._config.toast) this.sendToast(reminder);
  }

  private sendBrowserNotification(reminder: Reminder): void {
    if (!this.hasNotificationPermission) {
      console.error(
        '[R.S:2] Could not send browser notification, missing permission.'
      );
      return;
    }

    const notification: Notification = new Notification(
      `${reminder.source.name}`,
      {
        body: `[DUE] ${reminder.text}`,
        data: reminder,
        tag: 'reminder.due',
      }
    );

    notification.addEventListener('click', (event) => {
      const reminder = event.currentTarget['data'] as Reminder;

      window.open(this.getAssetUrlFromReminder(reminder, true), '_blank');
      notification.close();
    });
  }

  private sendToast(reminder: Reminder): void {
    const url = this.getAssetUrlFromReminder(reminder);
    const icon = `<i [c8yIcon]="${
      reminder.isGroup ? 'c8y-group-open' : 'c8y-device'
    }"></i>`;

    this.alertService.add({
      type: 'warning',
      text: `<a href="#${url}" class="full-click">${icon} ${reminder.source.name}</a><br />
        <small>[DUE] ${reminder.text}</small>`,
      allowHtml: true,
    });
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

    this.updateTimer = setTimeout(() => {
      this.reminders = this.digestReminders(this.reminders);
      this.sendNotification(closestReminder);
    }, moment(closestReminder.time).diff(now));
  }

  private setupConfigSubscription(): void {
    this.localStorageService.storage$
      .pipe(
        map((config) => {
          if (has(config, REMINDER_LOCAL_STORAGE_CONFIG))
            return JSON.parse(
              config[REMINDER_LOCAL_STORAGE_CONFIG]
            ) as ReminderConfig;
        })
      )
      .subscribe((config) => {
        this.config$.next(config);
      });
  }

  private setupReminderSubscription(): void {
    this.subscriptions.add(
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

  async update(reminder: Reminder): Promise<IResult<Reminder>> {
    const event: Partial<IEvent> = {
      id: reminder.id,
      status: reminder.status,
    };

    // (un)set `isCleared` fragment to supoprt using retention rules for cleared reminders
    event.isCleared = reminder.status === ReminderStatus.cleared ? {} : null;

    return (await this.eventService.update(event)) as IResult<Reminder>;
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
}
