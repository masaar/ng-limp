# ng-limp
Angular SDK for LIMP

# Quick Start
The current SDK has two dependencies:
* `jsrasgin`
* `ngx-cookie`
The dependencies should be automatically installed with the library, however due to some unneeded dependency bug in `ngx-cookie`, you might need to install `@nguniversal/express-engine` separatly.

## Install ng-limp
```bash
npm i --save limp/ng-limp
```

## How to Use
1. Import `NgLimpModule.forRoot()` in your module imports.
2. Initiate the API, in your component, using :
```typscript

import { Component, OnInit } from '@angular/core';

import { ApiService } from 'ng-limp'

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {

	constructor(private api: ApiService) {}

	ngOnInit() {
		this.api.init('ws://localhost:8081/ws', 'http://localhost:8081', '__ANON').subscribe((res) => {
			console.log('res', res);
		}, (err) => {
			console.log('err', err);
		});
	}
}
```