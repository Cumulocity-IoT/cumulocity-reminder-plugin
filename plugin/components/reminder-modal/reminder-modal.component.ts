import { Component, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { EventService, IEvent, IManagedObject, IResult } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { cloneDeep, has } from 'lodash';
import moment from 'moment';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Reminder, ReminderStatus, REMINDER_TEXT_LENGTH, REMINDER_TYPE } from '../../reminder.model';

@Component({
  selector: 'c8y-reminder-modal',
  templateUrl: './reminder-modal.component.html',
  styleUrls: ['./reminder-modal.component.less']
})
export class ReminderModalComponent implements OnInit {
  // TODO selectable context
  isLoading = false;
  asset!: Partial<IManagedObject>;
  form = new FormGroup({});

  reminder: Partial<Reminder> = {
    // source: {
    //   id: undefined,
    //   name: undefined
    // },
    text: undefined,
    time: undefined,
    type: REMINDER_TYPE
  };

  fields: FormlyFieldConfig[] = [
    {
      fieldGroup: [
        // {
        //   key: 'source.name',
        //   type: 'input',
        //   props: {
        //     label: this.translateService.instant('Attach to'),
        //     required: true,
        //     disabled: true
        //   }
        // },
        {
          key: 'text',
          type: 'input',
          props: {
            label: this.translateService.instant('Message'),
            required: true,
            maxLength: REMINDER_TEXT_LENGTH
            // TODO show max length & used chars
          }
        },
        {
          key: 'time',
          type: 'time',
          props: {
            label: this.translateService.instant('Remind me on'),
            required: true
          }
        }
      ]
    }
  ];

  constructor(
    private bsModalRef: BsModalRef,
    private eventService: EventService,
    private alertService: AlertService,
    private activatedRoute: ActivatedRoute,
    private translateService: TranslateService
  ) {}

  ngOnInit(): void {
    this.asset = this.getAssetFromRoute(this.activatedRoute.snapshot);
    this.reminder.source.id = this.asset.id;
    this.reminder.source.name = String(this.asset.name) || '';
  }

  close() {
    this.bsModalRef.hide();
  }

  assetSelected(asset: Partial<IManagedObject>): void {
    this.asset = {
      id: asset.id,
      name: asset.name
    };
  }

  async submit(): Promise<void> {
    this.isLoading = true;

    const reminder: IEvent = {
      source: {
        id: `${this.asset.id}`
      },
      type: REMINDER_TYPE,
      time: moment(this.reminder.time).toISOString(),
      text: this.reminder.text,
      status: ReminderStatus.active
    };

    if (has(this.asset, 'c8y_IsDeviceGroup')) reminder.isGroup = {};

    let request: IResult<IEvent>;

    try {
      request = await this.eventService.create(reminder);
    } catch (error) {
      console.error(error);
    }

    this.isLoading = false;

    if (request && request.res.status === 201) {
      this.alertService.success(this.translateService.instant('Reminder created'));
      this.close();
    } else {
      this.alertService.danger(this.translateService.instant('Could not create reminder'), await request.res.text());
    }
  }

  private recursiveContextSearch(route: ActivatedRouteSnapshot, numberOfCheckedParents = 0): IManagedObject {
    let context: { contextData: IManagedObject } = undefined;

    if (route?.data?.contextData) context = route.data as { contextData: IManagedObject };
    else if (route?.firstChild?.data?.contextData) context = route.firstChild.data as { contextData: IManagedObject };

    if (context?.contextData) return cloneDeep(context.contextData);
    else
      return route.parent && numberOfCheckedParents < 3
        ? this.recursiveContextSearch(route.parent, numberOfCheckedParents + 1)
        : undefined;
  }

  private getAssetFromRoute(route: ActivatedRouteSnapshot): IManagedObject {
    if (!route) console.error('No Route provided');
    else {
      const mo = this.recursiveContextSearch(route);

      if (has(mo, 'c8y_IsDevice') || has(mo, 'c8y_IsDeviceGroup')) return mo;
    }
    return undefined;
  }
}
