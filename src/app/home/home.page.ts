import { Component, OnInit } from '@angular/core';
import { IonHeader, IonToolbar, IonTitle, IonContent } from '@ionic/angular/standalone';
import * as Electron from 'electron';
import * as Serialport from 'serialport';


@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [IonHeader, IonToolbar, IonTitle, IonContent],
})
export class HomePage {
  constructor() {
    //let isElectron: boolean = window && window['process'] && window['process'].type;
    let isElectron: boolean = true;

    if (isElectron) {
      let serialport: typeof Serialport = window['require']('serialport');
      let app: Electron.App = window['require']('electron').remote;
      console.log(serialport, app, window['process']);
    }
  }

  getPorts() {
     Serialport.SerialPort.list().then( ports => {
       console.log(JSON.stringify(ports));
     });
   }
}
