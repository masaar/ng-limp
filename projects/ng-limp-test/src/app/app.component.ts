import { Component, OnInit } from '@angular/core';

import { ApiService } from 'ng-limp'

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
	title = 'ng-limp-test';

	constructor(private api: ApiService) {}

	ngOnInit() {
		this.api.init('ws://localhost:8081/ws', 'http://localhost:8081', '__ANON').subscribe((res) => {
			console.log('res', res);
		}, (err) => {
			console.log('err', err);
		});
	}
}
