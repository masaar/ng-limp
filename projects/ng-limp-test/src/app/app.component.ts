import { Component, OnInit } from '@angular/core';
import { take } from 'rxjs/operators';
import { ApiService } from 'ng-limp'

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
		this.api.init('ws://localhost:8081/ws', '__ANON')
			.pipe(take(1))
			.subscribe((res) => {
				this.api.auth('email', 'ADMIN@LIMP.MASAAR.COM', '__ADMIN').subscribe();
				console.log('res', res);
			}, (err) => {
				console.log('err', err);
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
		}).subscribe((res) => { console.log(res); });
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
		}).subscribe((res) => { console.log(res); });
	}
}
