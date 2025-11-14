import { ChangeDetectionStrategy, Component, OnInit, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectorRef, NO_ERRORS_SCHEMA, OnDestroy, HostListener } from '@angular/core';
import { TranslateModule } from '@ngx-translate/core';
import * as SerialPort from 'serialport';
import * as CryptoJS from 'crypto-js';
//import * as CryptoJS from 'crypto-browserify';
import { PortInfo } from "@serialport/bindings-interface";
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { LocalStorageService } from 'ngx-webstorage';

//const CryptoJS = require('crypto-browserify');
const CryptoJS_DH = require('diffie-hellman/browser');

enum DataType {
  PRIME = 0,
  GENERATOR = 1,
  PUBLIC_KEY = 2,
}

/*

Alice speak to Bob

*/

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

  portA: (SerialPort.SerialPort | undefined) = undefined;
  portB: (SerialPort.SerialPort | undefined) = undefined;
  //serialPort: SerialPort.SerialPort;
  serialPortIdA: number = -1;
  serialPortIdB: number = -1;
  serialPorts: Array<PortInfo> = Array<PortInfo>();
  dhA: (typeof CryptoJS_DH.DiffieHellman | undefined) = undefined;
  dhB: (typeof CryptoJS_DH.DiffieHellman | undefined) = undefined;

  sharedSecretA: (ArrayBuffer| undefined) = undefined;
  sharedSecretB: (ArrayBuffer| undefined) = undefined;

  serialportABufferReceived: (ArrayBuffer| undefined) = undefined;
  serialportBBufferReceived: (ArrayBuffer| undefined) = undefined;

  constructor(private ref: ChangeDetectorRef, private sanitizer: DomSanitizer, private localStorage: LocalStorageService) {
    this.resetSerialPortA();
    this.resetSerialPortB();
    //this.serialPort = window.require('serialport');
  }

  ngOnDestroy() {
    this.closeSerialPorts();
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    let portAPath  = this.localStorage.retrieve("lastportAPath");
    let portBPath  = this.localStorage.retrieve("lastportBPath");
    SerialPort.SerialPort.list().then(ports => {
      ports.forEach(e => {
        if ((e.pnpId !== undefined && e.pnpId.search(/uart/i) !== -1) || e.path.startsWith("COM")) {
          this.serialPorts.push(e);
          if (e.path === portAPath) {
            this.serialPortIdA = this.serialPorts.length - 1;
          } else if (e.path === portBPath) {
            this.serialPortIdB = this.serialPorts.length - 1;
          }
        }
        
      });
      this.ref.detectChanges();
      //console.log(JSON.stringify(this.serialPorts, null, 4));
    });
  }

  resetSerialPortB() {
    this.serialportBBufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }
  
  resetSerialPortA() {
    this.serialportABufferReceived = new ArrayBuffer(0 , {maxByteLength : 1024 * 1024});
  }

  resetSerialPorts() {
    this.resetSerialPortA();
    this.resetSerialPortB();
  }
  
  startSerialPorts() {
    this.closeSerialPorts();
    
    this.startSerialPortB();
    this.startSerialPortA();
  }

  startSerialPortA () {
    if (this.serialPortIdA === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortIdA] === undefined) {
      return;
    }
    if (this.portA !== undefined) {
      return;
    }
    this.dhA = undefined;
    let path: string = this.serialPorts[this.serialPortIdA].path;
    this.localStorage.store('lastportAPath', path);
    this.portA = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    this.consoleHTML = "Connect to " + path;
    this.portA.on("data", (d: Buffer) => {
      if (this.serialportABufferReceived !== undefined) {
        let publicKeyB : (ArrayBuffer | undefined) = undefined;
        let actualLength: number = this.serialportABufferReceived.byteLength;
        this.serialportABufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialportABufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialportABufferReceived);
        if (dataview4arrbuf.byteLength > 3) {
          let type = dataview4arrbuf.getUint8(0);
          let len = dataview4arrbuf.getUint16(1);
          while (this.serialportABufferReceived.byteLength >= (3 + len)) {
            this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u>";
            const arr: ArrayBuffer = this.serialportABufferReceived.slice(3, 3 + len);
            switch (type) {
              case DataType.PRIME:
                break;
              case DataType.GENERATOR:
                break;
              case DataType.PUBLIC_KEY:
                publicKeyB = arr;
                break;
            }
            this.serialportABufferReceived = this.serialportABufferReceived.slice(3 + len);
            if (publicKeyB !== undefined) {
              const publicKeyBUint8: Uint8Array = new Uint8Array(publicKeyB);
              this.sharedSecretA = this.dhA.computeSecret(publicKeyBUint8);
              this.consoleHTML = "sharedSecret calculate by Alice with publicKeyBob :";
              this.consoleHTML = JSON.stringify(this.sharedSecretA);
            }
            dataview4arrbuf = new DataView(this.serialportABufferReceived);
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

  startSerialPortB () {
    if (this.serialPortIdB === -1) {
      return;
    }
    if (this.serialPorts[this.serialPortIdB] === undefined) {
      return;
    }
    if (this.portB !== undefined) {
      return;
    }
    this.dhB = undefined;
    let path: string = this.serialPorts[this.serialPortIdB].path;
    this.localStorage.store('lastportBPath', path);
    this.portB = new SerialPort.SerialPort({
      path: path,
      baudRate: 115200,
    });
    this.consoleHTML = "Connect to " + path;
    let prime: (ArrayBuffer | undefined) = undefined;
    let generator: (ArrayBuffer | undefined) = undefined;
    let publicKeyA: (ArrayBuffer | undefined) = undefined;

    this.portB.on("data", (d: Buffer) => {
      if (this.serialportBBufferReceived !== undefined) {
        let actualLength: number = this.serialportBBufferReceived.byteLength;
        this.serialportBBufferReceived.resize(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialportBBufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialportBBufferReceived);
        if (dataview4arrbuf.byteLength > 3) {
          let type: DataType = dataview4arrbuf.getUint8(0) as DataType;
          let len = dataview4arrbuf.getUint16(1);
          while (this.serialportBBufferReceived.byteLength >= (3 + len)) {
            const arr: ArrayBuffer = this.serialportBBufferReceived.slice(3, 3 + len);
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
            this.serialportBBufferReceived = this.serialportBBufferReceived.slice(3 + len);
            if (this.dhB === undefined && prime !== undefined && generator !== undefined) {
              this.dhB = CryptoJS_DH.createDiffieHellman(prime, generator);
            }
            if (this.dhB !== undefined && publicKeyA !== undefined) {
              this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Bob</b></u>";
              const publicKeyB : ArrayBuffer = this.dhB.generateKeys();
              const publicKeyAUint8: Uint8Array = new Uint8Array(publicKeyA);
              
              this.sharedSecretB = this.dhB.computeSecret(publicKeyAUint8);
              this.consoleHTML = "sharedSecret calculate by Bob with publicKeyAlice :";
              this.consoleHTML = JSON.stringify(this.sharedSecretB);
              
              this.consoleHTML = "Send to Alice (publicKeyBob)";
              this.sendDataOnPort(this.portB, DataType.PUBLIC_KEY, publicKeyB);
            }
            dataview4arrbuf = new DataView(this.serialportBBufferReceived);
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

  sendDataSerialPortA () {
    this.startSerialPortA();
    this.startSerialPortB();
    this.generateKeyDH_Part1();
  }

  closeSerialPorts () {
    if (this.portA !== undefined) {
      if (this.portA.isOpen) {
        this.portA.close();
        this.consoleHTML = "Close " + this.portA.path
        this.portA = undefined;
      }
    }
    if (this.portB !== undefined) {
      if (this.portB.isOpen) {
        this.portB.close();
        this.consoleHTML = "Close " + this.portB.path
        this.portA = undefined;
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
    
    this.dhA = CryptoJS_DH.createDiffieHellman(128, 'sd2me');
    const prime : ArrayBuffer = this.dhA.getPrime();
    const primelen : number = prime.byteLength;
    const generator : ArrayBuffer = this.dhA.getGenerator();
    const generatorlen : number = generator.byteLength;
    
    const publicKeyA : ArrayBuffer = this.dhA.generateKeys();
    const publicKeyAlen : number = publicKeyA.byteLength;
    const privateKeyA : ArrayBuffer = this.dhA.getPrivateKey();
    
    this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u>";
    
    this.sendDataOnPort(this.portA, DataType.PRIME, prime);
    this.sendDataOnPort(this.portA, DataType.GENERATOR, generator);
    this.sendDataOnPort(this.portA, DataType.PUBLIC_KEY, publicKeyA);
  }

  aliceSendEncryptedDatas () {
    /*
    https://medium.com/@piyalidas.it/angular-encryption-and-decryption-using-cryptojs-a123505c67af
    */
    let testText: string = "C'est AtralTech qui se fait encoder";
    let testTextWordArray: CryptoJS.lib.WordArray = CryptoJS.lib.WordArray.create(this.sharedSecretA);
    let encryptedTestText: CryptoJS.lib.CipherParams = CryptoJS.AES.encrypt(testText, testTextWordArray);
    this.consoleHTML = JSON.stringify(encryptedTestText);
    this.consoleHTML = JSON.stringify(encryptedTestText.ciphertext);
  }

}