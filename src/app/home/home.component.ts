import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
import * as CryptoJS from 'crypto-js';
import { PortInfo } from "@serialport/bindings-interface";
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {MatFormFieldModule} from '@angular/material/form-field';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush, // using OnPush
    imports: [
      RouterLink, 
      TranslateModule,
      MatFormFieldModule,
      MatSelectModule,
      MatInputModule
  ],
  schemas: [ CUSTOM_ELEMENTS_SCHEMA ]
})
export class HomeComponent implements OnInit {
  //serialPort: SerialPort.SerialPort;
  serialPorts: PortInfo[] = [];

  constructor(private ref: ChangeDetectorRef, private router: Router) { 
    //this.serialPort = window.require('serialport');
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    SerialPort.SerialPort.list().then(ports => {
      ports.forEach(e => {
        if (e.pnpId !== undefined && e.pnpId.search(/uart/i) !== -1) {
          this.serialPorts.push(e);
        }
      });
    });
    this.ref.detectChanges();
  }

  listSerialPorts() {
    let port = new SerialPort.SerialPort({
      path: '/dev/ttyUSB0',
      baudRate: 115200,
    });
    port.write('main screen turn on', function(err) {
      if (err) {
        console.log('Error on write: ', err.message);
        return;
      }
      console.log('message written')
    })
  }
}
