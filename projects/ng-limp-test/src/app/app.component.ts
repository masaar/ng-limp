import { Component, OnInit } from '@angular/core';
import { take, retry } from 'rxjs/operators';
import { ApiService } from 'ng-limp'
import { Res, Doc } from 'ng-limp';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
	title = 'ng-limp-test';

	constructor(private api: ApiService) { }

	ngOnInit() {
		this.api.debug = true;
		this.api.init('ws://localhost:8081/ws', '__ANON_TOKEN_f00000000000000000000012')
			.pipe(retry(10))
			.subscribe((res: Res<Doc>) => {
				if (res.args.code == 'CORE_CONN_OK') {
					this.api.checkAuth().subscribe((res: Res<Doc>) => {
						console.log('checAuth.res', res);
					}, (err: Res<Doc>) => {
						console.log('checAuth.err', err);
					});
				}
				console.log('api.res', res);
			}, (err: Res<Doc>) => {
				console.log('api.err', err);
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

	auth(): void {
		this.api.auth('email', 'ADMIN@LIMP.MASAAR.COM', '__ADMIN').subscribe((res: Res<Doc>) => {
			console.log('auth.res', res);
		}, (err: Res<Doc>) => {
			console.log('auth.err', err);
		});
	}

	signout(): void {
		this.api.signout().subscribe((res: Res<Doc>) => {
			console.log('signout.res', res);
		}, (err: Res<Doc>) => {
			console.log('signout.err', err);
		});	
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
		}).subscribe((res: Res<Doc>) => {
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
		}).subscribe((res: Res<Doc>) => {
			console.log('createblogcat.res', res);
		}, (err: Res<Doc>) => {
			console.log('createblogcat.err', err);
		});
	}
}
