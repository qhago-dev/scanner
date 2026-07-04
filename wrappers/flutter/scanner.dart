import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/services.dart';

enum ScanAISymbology {
  code128,
  code39,
  code93,
  ean8,
  ean13,
  upca,
  upce,
  itf,
  codabar,
  qrCode,
  dataMatrix,
  pdf417,
  aztec,
}

class BarcodeResult {
  final String text;
  final String format;
  final double confidence;
  final List<Offset> corners;
  final int timestamp;

  BarcodeResult({
    required this.text,
    required this.format,
    required this.confidence,
    required this.corners,
    required this.timestamp,
  });

  factory BarcodeResult.fromMap(Map<String, dynamic> map) {
    return BarcodeResult(
      text: map['text'] as String,
      format: map['format'] as String,
      confidence: (map['confidence'] as num).toDouble(),
      corners: (map['corners'] as List)
          .map((c) => Offset(
                (c['x'] as num).toDouble(),
                (c['y'] as num).toDouble(),
              ))
          .toList(),
      timestamp: map['timestamp'] as int,
    );
  }
}

class ScanConfig {
  final List<ScanAISymbology> symbologies;
  final bool enableSuperResolution;
  final bool enableDeblur;
  final bool enablePerspectiveCorrection;
  final bool enableAutofocus;
  final bool enableTracking;
  final double trackingSensitivity;
  final double focusThreshold;
  final double minConfidence;
  final int scanIntervalMs;
  final int maxResolutionWidth;

  ScanConfig({
    this.symbologies = ScanAISymbology.values,
    this.enableSuperResolution = true,
    this.enableDeblur = true,
    this.enablePerspectiveCorrection = true,
    this.enableAutofocus = true,
    this.enableTracking = true,
    this.trackingSensitivity = 0.15,
    this.focusThreshold = 0.3,
    this.minConfidence = 0.5,
    this.scanIntervalMs = 100,
    this.maxResolutionWidth = 640,
  });

  Map<String, dynamic> toMap() => {
        'symbologies': symbologies.map((s) => s.name).toList(),
        'enable_super_resolution': enableSuperResolution,
        'enable_deblur': enableDeblur,
        'enable_perspective_correction': enablePerspectiveCorrection,
        'enable_autofocus': enableAutofocus,
        'enable_tracking': enableTracking,
        'tracking_sensitivity': trackingSensitivity,
        'focus_threshold': focusThreshold,
        'min_confidence': minConfidence,
        'scan_interval_ms': scanIntervalMs,
        'max_resolution_width': maxResolutionWidth,
      };
}

enum ScannerState { idle, loading, ready, scanning, error }

typedef ScanCallback = void Function(String eventType, Map<String, dynamic>? data);

class AIScannerFlutter {
  static const MethodChannel _channel = MethodChannel('scanai_sdk');

  ScanConfig _config;
  ScannerState _state = ScannerState.idle;
  final List<ScanCallback> _callbacks = [];

  AIScannerFlutter({ScanConfig? config}) : _config = config ?? ScanConfig();

  ScannerState get state => _state;

  void addListener(ScanCallback callback) {
    _callbacks.add(callback);
  }

  void removeListener(ScanCallback callback) {
    _callbacks.remove(callback);
  }

  void _notifyListeners(String eventType, Map<String, dynamic>? data) {
    for (final cb in _callbacks) {
      cb(eventType, data);
    }
  }

  Future<void> start() async {
    _state = ScannerState.loading;
    _notifyListeners('loading', {'progress': 0.0});

    try {
      await _channel.invokeMethod('start', {
        'config': _config.toMap(),
      });

      _state = ScannerState.ready;
      _notifyListeners('ready', null);

      _channel.setMethodCallHandler((call) async {
        switch (call.method) {
          case 'onDecode':
            final result = BarcodeResult.fromMap(
                Map<String, dynamic>.from(call.arguments));
            _notifyListeners('decode', {'data': result});
            break;
          case 'onLost':
            _notifyListeners('lost', null);
            break;
          case 'onFocus':
            _notifyListeners('focus', call.arguments as Map<String, dynamic>);
            break;
          case 'onError':
            _notifyListeners('error', {'message': call.arguments.toString()});
            break;
        }
      });
    } catch (e) {
      _state = ScannerState.error;
      _notifyListeners('error', {'message': e.toString()});
      rethrow;
    }
  }

  Future<BarcodeResult?> processImage(Uint8List imageData,
      int width, int height) async {
    final result = await _channel.invokeMethod('processImage', {
      'data': imageData,
      'width': width,
      'height': height,
    });

    if (result != null) {
      return BarcodeResult.fromMap(Map<String, dynamic>.from(result));
    }
    return null;
  }

  void updateConfig(ScanConfig config) {
    _config = config;
    _channel.invokeMethod('updateConfig', config.toMap());
  }

  Future<void> stop() async {
    await _channel.invokeMethod('stop');
    _state = ScannerState.idle;
  }

  void dispose() {
    stop();
    _callbacks.clear();
  }
}
