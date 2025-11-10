import { Component, OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';

@Component({
    selector: 'app-home',
    templateUrl: './home.component.html',
    styleUrls: ['./home.component.scss'],
    standalone: true,
    imports: [RouterLink, TranslateModule]
})
export class HomeComponent implements OnInit {
  //serialPort: SerialPort.SerialPort;

  constructor(private router: Router) { 
    //this.serialPort = window.require('serialport');
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    SerialPort.SerialPort.list().then(ports => {
      console.log(JSON.stringify(ports));
    })
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
