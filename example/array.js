function debug(value) {
    console.log('The value is: ' + value.toString());
}

function main() {
    var a = [43, 18];
    a[a.length] = 55;
    console.log(a[0]);
    console.log(a[1]);
    console.log(a[2]);
    a.push(66);
    a.push(68);
    console.log('length: ', a.length);
    a[a.length] = 999;
    console.log('length: ', a.length);
    console.log(a[0]);
    a.map(debug);
}
