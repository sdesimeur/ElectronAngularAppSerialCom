import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, NO_ERRORS_SCHEMA } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
import * as CryptoJS from 'crypto-js';
import { PortInfo } from "@serialport/bindings-interface";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    changeDetection: ChangeDetectionStrategy.OnPush, // using OnPush
    imports: [
      RouterLink, 
      TranslateModule,
      CommonModule,
      FormsModule
  ],
  //schemas: [ CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA ]
})
export class HomeComponent implements OnInit {
  //serialPort: SerialPort.SerialPort;
  serialPortId: number = -1;
  serialPorts: Array<PortInfo> = Array<PortInfo>();

  constructor(private ref: ChangeDetectorRef, private router: Router) { 
    //this.serialPort = window.require('serialport');
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    SerialPort.SerialPort.list().then(ports => {
      //console.log(JSON.stringify(ports));
      ports.forEach(e => {
        if (e.pnpId !== undefined && e.pnpId.search(/uart/i) !== -1) {
          this.serialPorts.push(e);
        }
      });
      console.log(JSON.stringify(this.serialPorts));
      console.log(JSON.stringify(this.serialPorts.length));
      //this.ref.detectChanges();
      this.ref.markForCheck();
    });
  }

  listSerialPorts() {
    if (this.serialPorts[this.serialPortId] == undefined) {
      return;
    }
    let port = new SerialPort.SerialPort({
      path: this.serialPorts[this.serialPortId].path,
      baudRate: 115200,
    });
    console.log("Connect to " + this.serialPorts[this.serialPortId].path)
    port.write('main screen turn on', function(err) {
      if (err) {
        console.log('Error on write: ', err.message);
        return;
      }
      console.log('message written');
      port.close();
      });
  }
}
