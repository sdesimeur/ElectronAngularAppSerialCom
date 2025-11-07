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
  }

  listSerialPorts() {
    SerialPort.SerialPort.list().then(ports => {
      console.log(JSON.stringify(ports));
    })
  }
}
