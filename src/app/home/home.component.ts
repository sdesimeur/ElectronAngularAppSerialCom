import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, NO_ERRORS_SCHEMA, OnDestroy, HostListener } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
//import * as CryptoJS from 'crypto-js';
//import * as CryptoJS from 'crypto-browserify';
import { PortInfo } from "@serialport/bindings-interface";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LocalStorageService } from 'ngx-webstorage';

//const CryptoJS = require('crypto-browserify');
const CryptoJS = require('diffie-hellman/browser');

enum DataType {
  PRIME = 0,
  GENERATOR = 1,
  PUBLIC_KEY = 2,
}

const DataTypeStrings: Array<string> = ["PRIME", "GENERATOR", "PUBLIC_KEY"];

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush, // using OnPush
  imports: [
    TranslateModule,
    CommonModule,
    FormsModule 
  ],
  //schemas: [ CUSTOM_ELEMENTS_SCHEMA, NO_ERRORS_SCHEMA ]
})
export class HomeComponent implements OnInit, OnDestroy {

  @HostListener("window:beforeunload", ["$event"]) unloadHandler(event: Event) {
      console.log("Processing beforeunload...");
      // Do more processing...
      this.closeSerialPorts();
  }
  
  _console: SafeHtml = "Contenu de la console:<br>Debut<br>";
  set consoleHTML (a: string) {
    //this._console = this.sanitizer.bypassSecurityTrustHtml(a + "<br>");
    this._console += a + "<br>";
    console.log(JSON.stringify(a));
    this.ref.detectChanges();
  }
  get consoleHTML (): SafeHtml {
    return this._console;
  }

  port1: (SerialPort.SerialPort | undefined) = undefined;
  port2: (SerialPort.SerialPort | undefined) = undefined;
  //serialPort: SerialPort.SerialPort;
  serialPortId1: number = -1;
  serialPortId2: number = -1;
  serialPorts: Array<PortInfo> = Array<PortInfo>();
  dh1: (typeof CryptoJS.DiffieHellman | undefined) = undefined;
  dh2: (typeof CryptoJS.DiffieHellman | undefined) = undefined;

  serialPort1BufferReceived: (ArrayBuffer| undefined) = undefined;
  serialPort2BufferReceived: (ArrayBuffer| undefined) = undefined;

  constructor(private ref: ChangeDetectorRef, private sanitizer: DomSanitizer, private localStorage: LocalStorageService) {
    this.resetSerialPort1();
    this.resetSerialPort2();
    //this.serialPort = window.require('serialport');
  }

  ngOnDestroy() {
    this.closeSerialPorts();
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    let port1Path  = this.localStorage.retrieve("lastPort1Path");
    let port2Path  = this.localStorage.retrieve("lastPort2Path");
    SerialPort.SerialPort.list().then(ports => {
      ports.forEach(e => {
        if ((e.pnpId !== undefined && e.pnpId.search(/uart/i) !== -1) || e.path.startsWith("COM")) {
          this.serialPorts.push(e);
          if (e.path === port1Path) {
            this.serialPortId1 = this.serialPorts.length - 1;
          } else if (e.path === port2Path) {
            this.serialPortId2 = this.serialPorts.length - 1;
          }
        }
        
      });
      this.ref.detectChanges();
      //console.log(JSON.stringify(this.serialPorts, null, 4));
    });
  }

  resetSerialPort2() {
    this.serialPort2BufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }
  
  resetSerialPort1() {
    this.serialPort1BufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }

  resetSerialPorts() {
    this.resetSerialPort1();
    this.resetSerialPort2();
  }
  
  startSerialPorts() {
    this.closeSerialPorts();
    
    this.startSerialPort2();
    this.startSerialPort1();
  }

  startSerialPort1 () {
    if (this.serialPortId1 === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortId1] === undefined) {
      return;
    }
    if (this.port1 !== undefined) {
      return;
    }
    this.dh1 = undefined;
    let path: string = this.serialPorts[this.serialPortId1].path;
    this.localStorage.store('lastPort1Path', path);
    this.port1 = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    this.consoleHTML = "Connect to " + path;
    this.port1.on("data", (d: Buffer) => {
      if (this.serialPort1BufferReceived !== undefined) {
        let publicKeyB : (ArrayBuffer | undefined) = undefined;
        let actualLength: number = this.serialPort1BufferReceived.byteLength;
        this.serialPort1BufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialPort1BufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialPort1BufferReceived);
        if (dataview4arrbuf.byteLength > 3) {
          let type = dataview4arrbuf.getUint8(0);
          let len = dataview4arrbuf.getUint16(1);
          while (this.serialPort1BufferReceived.byteLength >= (3 + len)) {
            this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u>";
            const arr: ArrayBuffer = this.serialPort1BufferReceived.slice(3, 3 + len);
            switch (type) {
              case DataType.PRIME:
                break;
              case DataType.GENERATOR:
                break;
              case DataType.PUBLIC_KEY:
                publicKeyB = arr;
                break;
            }
            this.serialPort1BufferReceived = this.serialPort1BufferReceived.slice(3 + len);
            if (publicKeyB !== undefined) {
              const publicKeyBUint8: Uint8Array = new Uint8Array(publicKeyB);
              const sharedSecret: ArrayBuffer = this.dh1.computeSecret(publicKeyBUint8);
              this.consoleHTML = "sharedSecret calculate by Alice with Bob publicKey :";
              this.consoleHTML = JSON.stringify(sharedSecret);
            }
            dataview4arrbuf = new DataView(this.serialPort1BufferReceived);
            if (dataview4arrbuf.byteLength < 3) {
              len = 0x10000;
            } else {
              type = dataview4arrbuf.getUint8(0);
              len = dataview4arrbuf.getUint16(1);
            }
          }
        }
      }
    })
  }

  startSerialPort2 () {
    if (this.serialPortId2 === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortId2] === undefined) {
      return;
    }
    if (this.port2 !== undefined) {
      return;
    }
    this.dh2 = undefined;
    let path: string = this.serialPorts[this.serialPortId2].path;
    this.localStorage.store('lastPort2Path', path);
    this.port2 = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    this.consoleHTML = "Connect to " + path;
    let prime: (ArrayBuffer | undefined) = undefined;
    let generator: (ArrayBuffer | undefined) = undefined;
    let publicKeyA: (ArrayBuffer | undefined) = undefined;

    this.port2.on("data", (d: Buffer) => {
      if (this.serialPort2BufferReceived !== undefined) {
        let actualLength: number = this.serialPort2BufferReceived.byteLength;
        this.serialPort2BufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialPort2BufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialPort2BufferReceived);
        if (dataview4arrbuf.byteLength > 3) {
          let type: DataType = dataview4arrbuf.getUint8(0) as DataType;
          let len = dataview4arrbuf.getUint16(1);
          while (this.serialPort2BufferReceived.byteLength >= (3 + len)) {
            const arr: ArrayBuffer = this.serialPort2BufferReceived.slice(3, 3 + len);
            switch (type) {
              case DataType.PRIME:
                prime = arr;
                break;
              case DataType.GENERATOR:
                generator = arr;
                break;
              case DataType.PUBLIC_KEY:
                publicKeyA = arr;
                break;
            }
            this.serialPort2BufferReceived = this.serialPort2BufferReceived.slice(3 + len);
            if (this.dh2 === undefined && prime !== undefined && generator !== undefined) {
              this.dh2 = CryptoJS.createDiffieHellman(prime, generator);
            }
            if (this.dh2 !== undefined && publicKeyA !== undefined) {
              this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Bob</b></u>";
              const publicKeyB : ArrayBuffer = this.dh2.generateKeys();
              const publicKeyAUint8: Uint8Array = new Uint8Array(publicKeyA);
              
              const sharedSecret: ArrayBuffer = this.dh2.computeSecret(publicKeyAUint8);
              this.consoleHTML = "Shared key calculate with publicKeyAlice";
              this.consoleHTML = JSON.stringify(new Buffer(sharedSecret));
              
              this.consoleHTML = "Send to Alice (publicKeyBob)";
              this.sendDataOnPort(this.port2, DataType.PUBLIC_KEY, publicKeyB);
            }
            dataview4arrbuf = new DataView(this.serialPort2BufferReceived);
            if (dataview4arrbuf.byteLength < 3) {
              len = 0x10000;
            } else {
              type = dataview4arrbuf.getUint8(0);
              len = dataview4arrbuf.getUint16(1);
            }
          }
        }
      }
    })
  }

  sendDataSerialPort1 () {
    this.startSerialPort1();
    this.startSerialPort2();
    this.generateKeyDH_Part1();
  }

  closeSerialPorts () {
    if (this.port1 !== undefined) {
      if (this.port1.isOpen) {
        this.port1.close();
        this.consoleHTML = "Close " + this.port1.path
        this.port1 = undefined;
      }
    }
    if (this.port2 !== undefined) {
      if (this.port2.isOpen) {
        this.port2.close();
        this.consoleHTML = "Close " + this.port2.path
        this.port1 = undefined;
      }
    }
  }


  sendDataOnPort (port: (SerialPort.SerialPort | undefined), type: DataType, arr: ArrayBuffer) {
    let arrbuf : ArrayBuffer;
    let dataview4arrbuf : DataView;
    let idx : number = 0;
    arrbuf = new ArrayBuffer(1 + 2 + arr.byteLength);
    dataview4arrbuf = new DataView(arrbuf);
    dataview4arrbuf.setUint8(0, type);
    dataview4arrbuf.setUint16(1, arr.byteLength);
    idx = 3;
    (new Uint8Array(arr)).forEach(n => {
      dataview4arrbuf.setUint8(idx, n);
      idx++;
    });
    if (port !== undefined) {
      port.write(dataview4arrbuf, undefined);
      this.consoleHTML = "Send to Bob ";
      this.consoleHTML = "[" + type + ", size " + DataTypeStrings[type] + " high, size " + DataTypeStrings[type] + " low, " + DataTypeStrings[type] + "...]";
      this.consoleHTML = JSON.stringify(new Buffer(arrbuf));
    }
  }

  generateKeyDH_Part1 () {
    
    this.dh1 = CryptoJS.createDiffieHellman(128, 'sd2me');
    const prime : ArrayBuffer = this.dh1.getPrime();
    const primelen : number = prime.byteLength;
    const generator : ArrayBuffer = this.dh1.getGenerator();
    const generatorlen : number = generator.byteLength;
    
    const publicKeyA : ArrayBuffer = this.dh1.generateKeys();
    const publicKeyAlen : number = publicKeyA.byteLength;
    const privateKeyA : ArrayBuffer = this.dh1.getPrivateKey();
    
    this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u>";
    
    this.sendDataOnPort(this.port1, DataType.PRIME, prime);
    this.sendDataOnPort(this.port1, DataType.GENERATOR, generator);
    this.sendDataOnPort(this.port1, DataType.PUBLIC_KEY, publicKeyA);
  }

}