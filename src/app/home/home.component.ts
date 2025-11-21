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
import { encode } from 'punycode';

//const CryptoJS = require('crypto-browserify');
const CryptoJS_DH = require('diffie-hellman/browser');
const textEnc = new TextEncoder();
/*

Alice speak to Bob

*/
const INITIAL_VECTOR: string = "7cb56057cb391c112e02588c74f4808e";

enum DataType {
  NONE = 0,
  PRIME = 1,
  GENERATOR,
  PUBLIC_KEY,
  ENCRYPTED_DATAS_WITH_SHAREDKEY,
  ENCRYPTED_SYSTEMKEY_WITH_SHAREDKEY,
}

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
  serialPortIdA: number = 0;
  serialPortIdB: number = 0;
  serialPorts: Array<PortInfo> = Array<PortInfo>();
  dhA: (typeof CryptoJS_DH.DiffieHellman | undefined) = undefined;
  dhB: (typeof CryptoJS_DH.DiffieHellman | undefined) = undefined;
  initialVector: ArrayBuffer = new ArrayBuffer(16);
  systemKey: (ArrayBuffer| undefined) = undefined;

  sharedSecretA: (ArrayBuffer| undefined) = undefined;
  sharedSecretB: (ArrayBuffer| undefined) = undefined;

  serialportABufferReceived: (ArrayBuffer| undefined) = undefined;
  serialportBBufferReceived: (ArrayBuffer| undefined) = undefined;

  constructor(private ref: ChangeDetectorRef, private sanitizer: DomSanitizer, private localStorage: LocalStorageService) {
    this.resetSerialPortA();
    this.resetSerialPortB();
    const wa = CryptoJS.enc.Hex.parse(INITIAL_VECTOR);
    let iv: DataView = new DataView(this.initialVector);
    iv.setUint32(0, wa.words[0], false);
    iv.setUint32(4, wa.words[1], false);
    iv.setUint32(8, wa.words[2], false);
    iv.setUint32(12, wa.words[3], false);
    //this.serialPort = window.require('serialport');
  }

  ngOnDestroy() {
    this.closeSerialPorts();
  }

  ngOnInit(): void {
    console.log('HomeComponent INIT');
    let portAPath  = this.localStorage.retrieve("lastportAPath");
    let portBPath  = this.localStorage.retrieve("lastportBPath");
    let tmp: PortInfo = {
      path: "Aucun port",
      manufacturer: undefined,
      serialNumber: undefined,
      pnpId: undefined,
      locationId: undefined,
      productId: undefined,
      vendorId: undefined,
    };
    this.serialPorts.push(tmp);
    SerialPort.SerialPort.list().then(ports => {
      console.log(JSON.stringify(ports, null, 4));
      ports.forEach(e => {
        if (e.path.startsWith("COM") || 
        (e.pnpId !== undefined && e.pnpId.search(/FTDI/i) !== -1) || 
        (e.pnpId !== undefined && e.pnpId.search(/TTL/i) !== -1) || 
        (e.pnpId !== undefined && e.pnpId.search(/serial/i) !== -1) 
      ) {
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
    this.serialportBBufferReceived = new ArrayBuffer(0);
  }
  
  resetSerialPortA() {
    this.serialportABufferReceived = new ArrayBuffer(0);
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
    if (this.serialPorts[this.serialPortIdA] === undefined) {
      return;
    }
    if (this.portA !== undefined) {
      if (this.portA.path === this.serialPorts[this.serialPortIdA].path) {
        return;
      } else {
        this.portA.close();
      }
    }
    if (this.serialPortIdA === 0) {
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
        this.serialportABufferReceived = this.serialportABufferReceived.transfer(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialportABufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialportABufferReceived);
        if (dataview4arrbuf.byteLength > 2) {
          let type = dataview4arrbuf.getUint8(0);
          let len = dataview4arrbuf.getUint8(1);
          while (this.serialportABufferReceived.byteLength > (2 + len)) {
            const arr: ArrayBuffer = this.serialportABufferReceived.slice(2, 2 + len);
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
              this.consoleHTML = "&nbsp;&nbsp;<b><u>Alice</u></b> : sharedSecret calculate with publicKeyBob :";
              this.consoleHTML = JSON.stringify(this.sharedSecretA);
              publicKeyB = undefined;
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
    if (this.serialPorts[this.serialPortIdB] === undefined) {
      return;
    }
    if (this.portB !== undefined) {
      if (this.portB.path === this.serialPorts[this.serialPortIdB].path) {
        return;
      } else {
        this.portB.close();
      }
    }
    if (this.serialPortIdB === 0) {
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
    let encryptedSystemKeyWithSharedKey: (ArrayBuffer | undefined) = undefined;

    this.portB.on("data", async (d: Buffer) => {
      if (this.serialportBBufferReceived !== undefined) {
        let actualLength: number = this.serialportBBufferReceived.byteLength;
        this.serialportBBufferReceived = this.serialportBBufferReceived.transfer(actualLength + d.byteLength);
        let uint8arr : Uint8Array = new Uint8Array(this.serialportBBufferReceived);
        uint8arr.set(d, actualLength);
        let dataview4arrbuf : DataView = new DataView(this.serialportBBufferReceived);
        if (dataview4arrbuf.byteLength > 2) {
          let type: DataType = dataview4arrbuf.getUint8(0) as DataType;
          let len = dataview4arrbuf.getUint8(1);
          while (this.serialportBBufferReceived.byteLength > (2 + len)) {
            const arr: ArrayBuffer = this.serialportBBufferReceived.slice(2, 2 + len);
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
              case DataType.ENCRYPTED_SYSTEMKEY_WITH_SHAREDKEY:
                encryptedSystemKeyWithSharedKey = arr;
                break;
              default:
                return;
                break;
            }
            this.serialportBBufferReceived = this.serialportBBufferReceived.slice(3 + len);
            if (encryptedSystemKeyWithSharedKey !== undefined) {
              if (this.sharedSecretA !== undefined) {
                this.systemKey = await this.DecryptDatas(this.sharedSecretA, encryptedSystemKeyWithSharedKey);
                this.consoleHTML = "&nbsp;&nbsp;<b><u>Bob</u></b> : decrypt systemKey sent by Alice";
                if (this.systemKey !== undefined)
                {
                  this.consoleHTML = JSON.stringify(new Buffer(this.systemKey));
                }
              }
              encryptedSystemKeyWithSharedKey = undefined;
            } else if (this.dhB === undefined && prime !== undefined && generator !== undefined) {
              this.dhB = CryptoJS_DH.createDiffieHellman(prime, generator);
              prime = undefined;
              generator = undefined;
            } else if (this.dhB !== undefined && publicKeyA !== undefined) {
              const publicKeyB : ArrayBuffer = this.dhB.generateKeys();
              const publicKeyAUint8: Uint8Array = new Uint8Array(publicKeyA);
              
              this.sharedSecretB = this.dhB.computeSecret(publicKeyAUint8);
              this.consoleHTML = "&nbsp;&nbsp;<b><u>Bob</u></b> : sharedSecret calculate with publicKeyAlice :";
              this.consoleHTML = JSON.stringify(this.sharedSecretB);
              
              this.sendDataOnPort(this.portB, DataType.PUBLIC_KEY, publicKeyB);
              publicKeyA = undefined;
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
    arrbuf = new ArrayBuffer(1 + 1 + arr.byteLength + 1);
    dataview4arrbuf = new DataView(arrbuf);
    dataview4arrbuf.setUint8(0, type);
    dataview4arrbuf.setUint8(1, arr.byteLength);
    idx = 2;
    (new Uint8Array(arr)).forEach(n => {
      dataview4arrbuf.setUint8(idx, n);
      idx++;
    });
    dataview4arrbuf.setUint8(idx, 0xAA);
    if (port !== undefined) {
      port.write(dataview4arrbuf, undefined);
      if (port === this.portA) {
        this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Alice</b></u> : Send to Bob";
      } else {
        this.consoleHTML = "&nbsp;&nbsp;&nbsp;<u><b>Bob</b></u> : Send to Alice";
      }
      const typeText : string = DataType[type];
      this.consoleHTML = "[" + type + ", size " + typeText + ", " + typeText + "..., 170]";
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
    
    this.sendDataOnPort(this.portA, DataType.PRIME, prime);
    this.sendDataOnPort(this.portA, DataType.GENERATOR, generator);
    this.sendDataOnPort(this.portA, DataType.PUBLIC_KEY, publicKeyA);
  }

  async aliceSendEncryptedSystemKey() {
    /*
    https://medium.com/@piyalidas.it/angular-encryption-and-decryption-using-cryptojs-a123505c67af
    */
    if (this.sharedSecretA !== undefined) {
      /*let testText: string = "C'est AtralTech qui se fait encoder puis décoder";
      const enc = new TextEncoder();
      const encoded= enc.encode(testText);*/
      //let testTextWordArray: CryptoJS.lib.WordArray = CryptoJS.lib.WordArray.create(testText);
      const key : CryptoKey = await window.crypto.subtle.importKey("raw", this.sharedSecretA, "AES-CBC", false, ["decrypt", "encrypt"]);
      let systemKey: ArrayBuffer = new ArrayBuffer(128/8);
      const systemKeyRandom = window.crypto.getRandomValues(new Uint8Array(systemKey));
      let encryptedSystemKey: ArrayBuffer = await window.crypto.subtle.encrypt({
          name: "AES-CBC",
          iv: this.initialVector
        },
        key,
        systemKeyRandom
      );
      this.consoleHTML = "Clear text in Uint8Array";
      this.consoleHTML = JSON.stringify(new Buffer(systemKeyRandom));
      this.consoleHTML = "Encrypted text in Uint8Array";
      this.consoleHTML = JSON.stringify(new Buffer(encryptedSystemKey));
      this.sendDataOnPort(this.portA, DataType.ENCRYPTED_SYSTEMKEY_WITH_SHAREDKEY ,encryptedSystemKey);
      //this.consoleHTML = JSON.stringify(encryptedTestText);
    }
  }

  async DecryptDatas(key: ArrayBuffer, encryptedDatas: ArrayBuffer) : Promise<ArrayBuffer|undefined> {
    if (this.sharedSecretB !== undefined) {
      const enc = new TextDecoder();
      //let testTextWordArray: CryptoJS.lib.WordArray = CryptoJS.lib.WordArray.create(testText);
      const keyImported : CryptoKey = await window.crypto.subtle.importKey("raw", key, "AES-CBC", false, ["decrypt", "encrypt"]);
      let decryptedTestText: ArrayBuffer = await window.crypto.subtle.decrypt({
          name: "AES-CBC",
          iv: this.initialVector
        },
        keyImported,
        encryptedDatas
      );
      //this.consoleHTML = enc.decode(decryptedTestText);

      return decryptedTestText;
      //this.consoleHTML = JSON.stringify(encryptedTestText);
    }
    return undefined;
  }
            
}