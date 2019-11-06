import { Component, OnInit } from '@angular/core';
import { take, retry } from 'rxjs/operators';

import { ApiService, Res, Doc } from 'projects/ng-limp/src/public_api';


// import { ApiService, Query, QueryStep, Doc } from 'ng-limp'
// import { Res, Doc } from 'ng-limp';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
	title = 'ng-limp-test';
	retryCount: number = 3;

	constructor(public api: ApiService) { }

	ngOnInit() {
		// this.api.debug = true;
		// this.api.authAttrs = ['email'];
		this.api.inited$.subscribe((init) => {
			if (init) {
				try {
					this.api.checkAuth();
				} catch (err) {
					console.log(err);
				}
			} else {
				console.log('will try to reconnect');
				if (this.retryCount > 0) {
					this.retryCount--;
					this.init();
				} else {
					alert('I\'m dead');
				}
			}
		});
		this.api.authed$.subscribe((session: Doc) => {
			console.log('authed$.session', session);
			if (session) {
				window.history.replaceState('Object', 'Title', '/authed');
			} else {
				window.history.replaceState('Object', 'Title', '/not-authed');
			}
		});
	}

	init(): void {
		this.api.init({
			api: 'ws://localhost:8081/ws',
			anonToken: '__ANON_TOKEN_f00000000000000000000012',
			authAttrs: ['email'],
			debug: true
		});
	}

	auth(): void {
		this.api.auth('email', 'ADMIN@LIMP.MASAAR.COM', '__ADMIN');
		//.subscribe((res) => { alert('Authed succefully!') });
	}

	signout(): void {
		this.api.signout();
		//.subscribe((res) => { alert('Singed-out succefully!') });
	}

	submit(): void {
		this.api.call('staff/create', {
			doc: {
				name: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				},
				bio: {
					ar_AE: 'bio ar',
					en_AE: 'bio en'
				},
				jobtitle: {
					ar_AE: 'jobtitle ar',
					en_AE: 'jobtitle en'
				},
				photo: document.querySelector('input').files,
			}
		}, true).subscribe((res: Res<Doc>) => {
			console.log('submit.res', res);
		}, (err: Res<Doc>) => {
			console.log('submit.err', err);
		});
	}

	createblogcat(): void {
		this.api.call('blog_cat/create', {
			doc: {
				title: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				},
				desc: {
					ar_AE: 'staff ar',
					en_AE: 'staff en'
				}
			}
		}, true).subscribe((res: Res<Doc>) => {
			console.log('createblogcat.res', res);
		}, (err: Res<Doc>) => {
			console.log('createblogcat.err', err);
		});
	}
}
